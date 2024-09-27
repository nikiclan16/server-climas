const { Query } = require('pg')
const pool = require('../config')
const { QUERYS } = require('../querys')
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
//const HttpProxyAgent = require("http-proxy-agent");
const moment = require('moment')
const {saveLog} = require('../helpers/index')

exports.climaController = async (req, res) => {
    try {
        //const proxyAgent = new HttpProxyAgent.HttpProxyAgent(process.env.URL_PROXY);
        //Validamos que la fecha anterior a la fecha actual este registrada, si no lo está consume la API con los días correspondientes
        const diaAnterior = moment().add(-1, 'day').format('YYYY-MM-DD')
        const buscarConsumoAPI2 = await pool.query(QUERYS.buscarUltimaFechaClimaLog, [diaAnterior])
        if(buscarConsumoAPI2.rowCount == 0){
        //if(true){
            let totaldias = 0;
            //Tenemos en cuenta la ultima fecha para cargar la o las fecha faltantes hasta el día anterior
            const buscarConsumoAPI = await pool.query(QUERYS.buscarUltimaFechaClima);
            if(buscarConsumoAPI.rowCount > 0){
                const fechaActual = new Date().getTime()
                const fechaBuscada = new Date(buscarConsumoAPI.rows[0].fecha).getTime()
                totaldias = parseInt((fechaActual - fechaBuscada)/(1000*60*60*24))
            }
            const ucp = await pool.query(QUERYS.cargarUCP, ["2", "1"]);

            //INICIO DE HISTÓRICO
            if (totaldias > 0){
                let ciudadID = "";
                let ciudad = "";
                //Busca la key de la API
                const bKeyH = await pool.query(QUERYS.buscarKey, [15]);
                if (ucp.rowCount > 0){
                    //if(true){
                        for(const fila of ucp.rows){
                            switch (fila.aux2){
                            //switch ("Cartagena"){
                                case "Bolivar":
                                    ciudadID = "3689147";
                                    ciudad = "Bolivar";
                                    break;
                                case "Planeta":
                                    ciudadID = "3689759";
                                    ciudad = "Planeta";
                                    break;
                                case "CordobaSucre":
                                    ciudadID = "3689759";
                                    ciudad = "CordobaSucre";
                                    break;
                                case "Sincelejo":
                                    ciudadID = "3667983";
                                    ciudad = "Sincelejo";
                                    break;
                                case "Cesar":
                                    ciudadID = "3666304";
                                    ciudad = "Cesar";
                                    break;
                                case "GM":
                                    ciudadID = "3668605";
                                    ciudad = "GM";
                                    break;
                                case "TubosCaribe":
                                    ciudadID = "3687238";
                                    ciudad = "TubosCaribe";
                                    break;
                            }
                            if(bKeyH.rowCount  > 0){
                                if(ciudadID != ""){
                                    const apiHistorico = `http://dataservice.accuweather.com/currentconditions/v1/${ciudadID}/historical/24?apikey=${bKeyH.rows[0].aux}&language=es&details=true`
                                    const responseHistorico = await fetch(apiHistorico/* , { agent: proxyAgent } */);
                                    const dataHistorico = await responseHistorico.json();
                                    //console.log(JSON.stringify(dataHistorico), "dataHistorico"); // Outputs the fetched data
                                    
                                    saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => Se inició el proceso para Históstico correctamente\n`)
                                    //Armamos el proceso de almacenamiento en el array
                                    let arrayHistorico = []
                                    let i = 1
                                    for(dataH of dataHistorico){
                                        let periodos = {}
                                        const dateSplit = dataH.LocalObservationDateTime.split('T')[0]
                                        let indexT = `p${i}_t`
                                        let indexH = `p${i}_h`
                                        let indexV = `p${i}_v`
                                        let indexI = `p${i}_i`
        
                                        const temperatura = dataH.Temperature.Metric.Value
                                        const potencia = 13.12 + 0.6215 * parseFloat(temperatura) - 11.37 * Math.pow(parseFloat(dataH.Wind.Speed.Metric.Value), 0.16) + 0.3965 * parseFloat(temperatura) * Math.pow(parseFloat(dataH.Wind.Speed.Metric.Value), 0.16)
        
                                        periodos[indexT] = potencia,
                                        periodos[indexH] = dataH.RelativeHumidity,
                                        periodos[indexV] = dataH.Wind.Speed.Metric.Value
                                        periodos[indexI] = dataH.WeatherIcon
                                        arrayHistorico.push({
                                            date: dateSplit,
                                            periodos
                                        })
                                        i++
                                    }
                                    //console.log(arrayHistorico, "arrayHistorico")
                                    for(let j = 0; j < 1; j++){
                                        const fechaAnterior = moment().add(j-1, 'day').format('YYYY-MM-DD')
                                        //Recorremos los 24 periodos
                                        for (let p = 0; p < 23; p++){
                                            //Para temperatura
                                            const bfechaclimaTemp = await pool.query(QUERYS.buscarClimaPeriodos,[ciudad, fechaAnterior]);
                                            if (bfechaclimaTemp.rowCount == 0){
                                                if (p == 0){
                                                    await pool.query(QUERYS.agregarClimaPronosticoLog,[fechaAnterior, ciudad]);//Guardamos el log de las fechas registradas
                                                    const valor24 = (parseFloat(arrayHistorico[23].periodos[`p24_t`])).toFixed(4)
                                                    await pool.query(`INSERT INTO datos_clima (fecha, ucp, p24_t) VALUES ('${fechaAnterior}', '${ciudad}', ${valor24})`);

                                                    const valor = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_t`])).toFixed(4)
                                                    await pool.query(`UPDATE datos_clima SET p${p+1}_t=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);
                                                }else{
                                                    const valor = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_t`])).toFixed(4)
                                                    await pool.query(`INSERT INTO datos_clima (fecha, ucp, p${p+1}_t) VALUES ('${fechaAnterior}', '${ciudad}', ${valor})`);
                                                }
                                            }
                                            else{
                                                if (p == 0)
                                                {
                                                    const valor = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_t`])).toFixed(4)
                                                    await pool.query(`UPDATE datos_clima SET p24_t=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);
                                                }
                                                else
                                                {
                                                    const valor = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_t`])).toFixed(4)
                                                    await pool.query(`UPDATE datos_clima SET p${p+1}_t=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);
                                                }
                                            }
        
                                            //Para humedad
                                            const bfechaclimaHume = await pool.query(QUERYS.buscarClimaPeriodos,[ciudad, fechaAnterior]);
                                            if (bfechaclimaHume == null)
                                            {
                                                const valor = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_h`])).toFixed(4)
                                                await pool.query(`INSERT INTO datos_clima (fecha, ucp, p${p+1}_h) VALUES ('${fechaAnterior}', '${ciudad}', ${valor})`);
                                            }
                                            else
                                            {
                                                if (p == 0)
                                                {
                                                    const valor24 = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_h`])).toFixed(4)
                                                    await pool.query(`UPDATE datos_clima SET p24_h=${valor24} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);

                                                    const valor = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_h`])).toFixed(4)
                                                    await pool.query(`UPDATE datos_clima SET p${p+1}_h=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);
                                                }
                                                else
                                                {
                                                    const valor = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_h`])).toFixed(4)
                                                    await pool.query(`UPDATE datos_clima SET p${p+1}_h=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);
                                                }
                                            }
        
                                            //Para velocidad
                                            const bfechaclimaVelo = await pool.query(QUERYS.buscarClimaPeriodos,[ciudad, fechaAnterior]);
                                            if (bfechaclimaVelo == null)
                                            {
                                                const valor = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_v`])).toFixed(4)
                                                await pool.query(`INSERT INTO datos_clima (fecha, ucp, p${p+1}_v) VALUES ('${fechaAnterior}', '${ciudad}', ${valor})`);
                                            }
                                            else
                                            {
                                                if (p == 0)
                                                {
                                                    const valor24 = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_v`])).toFixed(4)
                                                    await pool.query(`UPDATE datos_clima SET p24_v=${valor24} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);

                                                    const valor = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_v`])).toFixed(4)
                                                    await pool.query(`UPDATE datos_clima SET p${p+1}_v=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);
                                                }
                                                else
                                                {
                                                    const valor = (parseFloat(arrayHistorico[p].periodos[`p${p+1}_v`])).toFixed(4)
                                                    await pool.query(`UPDATE datos_clima SET p${p+1}_v=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);
                                                }
                                            }

                                            //Para Icono
                                            const bfechaclimaIcono = await pool.query(QUERYS.buscarClimaPeriodos,[ciudad, fechaAnterior]);
                                            if (bfechaclimaIcono == null)
                                            {
                                                const valor = arrayHistorico[p].periodos[`p${p+1}_i`]
                                                await pool.query(`INSERT INTO datos_clima (fecha, ucp, p${p+1}_i) VALUES ('${fechaAnterior}', '${ciudad}', ${valor})`);
                                            }
                                            else
                                            {
                                                if (p == 0)
                                                {
                                                    const valor24 = arrayHistorico[p].periodos[`p${p+1}_i`]
                                                    await pool.query(`UPDATE datos_clima SET p24_i=${valor24} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);

                                                    const valor = arrayHistorico[p].periodos[`p${p+1}_i`]
                                                    await pool.query(`UPDATE datos_clima SET p${p+1}_i=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);
                                                }
                                                else
                                                {
                                                    const valor = arrayHistorico[p].periodos[`p${p+1}_i`]
                                                    await pool.query(`UPDATE datos_clima SET p${p+1}_i=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`);
                                                }
                                            }
                                        }
                                    }
                                    saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => Se culminó el proceso para Históstico correctamente\n`)
                                }else{
                                    saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => El MC ${fila.aux2} de la BD no se encuentra en el Switch Case\n`)
                                }
                            }else{
                                saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => No se encuentró la Key para Histórico\n`)
                            }
                        }
                }else{
                    saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => No se encuentró Mercados registrados para Histórico\n`)
                }
            }
            //FIN DE HISTÓRICO            

            //INICIO DE PRONÓSTICO
            const bKeyP = await pool.query(QUERYS.buscarKey, [12]);
            if (ucp.rowCount > 0){
                let ciudadID = "";
                let ciudad = "";
                //if(true){
                for(const fila of ucp.rows){
                    switch (fila.aux2){
                    //switch ("Barranquilla"){
                        case "Bolivar":
                            ciudadID = "3689147";
                            ciudad = "Bolivar";
                            break;
                        case "Planeta":
                            ciudadID = "3689759";
                            ciudad = "Planeta";
                            break;
                        case "CordobaSucre":
                            ciudadID = "3689759";
                            ciudad = "CordobaSucre";
                            break;
                        case "Sincelejo":
                            ciudadID = "3667983";
                            ciudad = "Sincelejo";
                            break;
                        case "Cesar":
                            ciudadID = "3666304";
                            ciudad = "Cesar";
                            break;
                        case "GM":
                            ciudadID = "3668605";
                            ciudad = "GM";
                            break;
                        case "TubosCaribe":
                            ciudadID = "3687238";
                            ciudad = "TubosCaribe";
                            break;
                    }
                    if(bKeyP.rowCount > 0){
                        if(ciudadID != ""){
                            const apiPronostico = `http://api.openweathermap.org/data/2.5/forecast?id=${ciudadID}&APPID=${bKeyP.rows[0].aux}&units=metric`
                            const responsePronostico = await fetch(apiPronostico/* , { agent: proxyAgent } */);
                            const dataPronostico = await responsePronostico.json();
                            console.log(JSON.stringify(dataPronostico), "dataPronostico"); // Outputs the fetched data

                            saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => Se inició el proceso para Pronóstico correctamente\n`)
                            for(const dataP of dataPronostico.list){
                                const fecha = dataP.dt_txt.split(' ')
                                const hora = fecha[1].split(':')

                                //Validando las horas (periodos)
                                let pos = 0;
                                switch (hora[0])
                                {
                                    case "00":
                                        pos = 24;
                                        break;
                                    case "10":
                                        pos = 10;
                                        break;
                                    case "20":
                                        pos = 20;
                                        break;
                                    default:
                                        pos = hora[0].replace('0','');
                                        break;
                                }
                                //Declaración de variables climáticas
                                const tem = dataP.main.temp;
                                const hum = dataP.main.humidity;
                                const vel = dataP.wind.speed;

                                //Búsqueda de cada Mercado de comercialización por fecha
                                const search = await pool.query(QUERYS.buscarFechaClima, [fecha[0], ciudad]);
                                if(search.rowCount > 0){
                                    //Si existe fecha se actualizan los periodos correspondientes
                                    await pool.query(`UPDATE datos_clima SET p${pos}_t=${tem}, p${pos}_h=${hum}, p${pos}_v=${vel} WHERE fecha='${fecha[0]}' AND ucp='${ciudad}' RETURNING *`)
                                    
                                }else{
                                    //Si no existe fecha se agregan los periodos correspondientes
                                    await pool.query(`INSERT INTO datos_clima (fecha, ucp, p${pos}_t, p${pos}_h, p${pos}_v) VALUES ('${fecha[0]}', '${ciudad}', ${tem}, ${hum}, ${vel})`)
                                }
                            }//Este proceso finaliza ingresando los datos de cada mercado en 3, 6, 9, 12, 15, 18, 24 periodos por cada clima

                            //Duplica las variables climaticas de los periodos cargados por cada Mercado de Comercialización hasta llegar a 12 días
                            const row = await pool.query(QUERYS.buscarUltimasFechasClimaPronostico, [ciudad, 1]);
                            if(row.rowCount > 0){
                                for(let i = 0; i < 6; i++){
                                    const diasiguiente = moment(row.rows[0].fecha).add(i,'days').format('YYYY-MM-DD')
                                    const search = await pool.query(QUERYS.buscarFechaClima, [diasiguiente, ciudad]);
                                    if(search.rowCount == 0){
                                        //Si no existe fecha se agregan los periodos correspondientes
                                        await pool.query(`INSERT INTO datos_clima (fecha, ucp, p1_t, p1_h, p1_v) VALUES ('${diasiguiente}', '${ciudad}', ${row.rows[0].p1_t}, ${row.rows[0].p1_h}, ${row.rows[0].p1_v})`);
                                    }
                                    for(let n = 2; n <= 24; n++){
                                        await pool.query(`UPDATE datos_clima SET p${n}_t=${row.rows[0][`p${n}_t`]}, p${n}_h=${row.rows[0][`p${n}_t`]}, p${n}_v=${row.rows[0][`p${n}_v`]} WHERE fecha='${diasiguiente}' AND ucp='${ciudad}' RETURNING *`)
                                    }
                                }
                            }
                            //Se completa con ello los 12 días
                            const row2 = await pool.query(QUERYS.buscarUltimasFechasClimaPronostico, [ciudad, 1]);
                            if(row2.rowCount > 0){
                                const diasiguiente = moment(row2.rows[0].fecha).add(1,'days').format('YYYY-MM-DD')
                                const search = await pool.query(QUERYS.buscarFechaClima, [diasiguiente, ciudad]);
                                if(search.rowCount == 0){
                                    //Si no existe fecha se agregan los periodos correspondientes
                                    await pool.query(`INSERT INTO datos_clima (fecha, ucp, p1_t, p1_h, p1_v) VALUES ('${diasiguiente}', '${ciudad}', ${row2.rows[0].p1_t}, ${row2.rows[0].p1_h}, ${row2.rows[0].p1_v})`);
                                }
                                for(let n = 2; n <= 24; n++){
                                    await pool.query(`UPDATE datos_clima SET p${n}_t=${row2.rows[0][`p${n}_t`]}, p${n}_h=${row2.rows[0][`p${n}_t`]}, p${n}_v=${row2.rows[0][`p${n}_v`]} WHERE fecha='${diasiguiente}' AND ucp='${ciudad}' RETURNING *`)
                                }
                            }

                            //Buslos lo ultimos 12 días agregados
                            const row3 = await pool.query(QUERYS.buscarUltimasFechasClimaPronostico, [ciudad, 12]);
                            if(row3.rowCount > 0){
                                let k = 0
                                while(k < row3.rowCount){
                                    //Rellenamos los campos faltantes
                                    for(let j = 1; j <=24;j++){
                                        const buscarPeriodoClimaT = await pool.query(`SELECT p${j}_t, p${j}_h, p${j}_v FROM datos_clima WHERE fecha = '${moment(row3.rows[k]['fecha']).format('YYYY-MM-DD')}' `)
                                        if(buscarPeriodoClimaT.rowCount > 0){
                                            if(buscarPeriodoClimaT.rows[0][`p${j}_t`] == null){
                                                const buscarTemperatura = await pool.query(QUERYS.buscarTemperatura, [moment(row3.rows[k]['fecha']).format('YYYY-MM-DD')])
                                                let valT = 0
                                                if(buscarTemperatura.rowCount > 0){
                                                    for(let m = 0; m < 24;m++){
                                                        if(buscarTemperatura.rows[0][`p${m+1}_t`] != null && valT == 0){
                                                            let valorTemperatura = buscarTemperatura.rows[0][`p${m+1}_t`]
                                                            await pool.query(`UPDATE datos_clima SET p${j}_t=${valorTemperatura} WHERE fecha='${moment(row3.rows[k]['fecha']).format('YYYY-MM-DD')}'`)
                                                            valT = 1;
                                                        }
                                                    }
                                                }
                                            }
                                            
                                            if(buscarPeriodoClimaT.rows[0][`p${j}_h`] == null){
                                                const buscarTemperatura = await pool.query(QUERYS.buscarTemperatura, [moment(row3.rows[k]['fecha']).format('YYYY-MM-DD')])
                                                let valH = 0
                                                if(buscarTemperatura.rowCount > 0){
                                                    for(let m = 0; m < 24;m++){
                                                        if(buscarTemperatura.rows[0][`p${m+1}_h`] != null && valH == 0){
                                                            let valorTemperatura = buscarTemperatura.rows[0][`p${m+1}_h`]
                                                            await pool.query(`UPDATE datos_clima SET p${j}_h=${valorTemperatura} WHERE fecha='${moment(row3.rows[k]['fecha']).format('YYYY-MM-DD')}'`)
                                                            valH = 1;
                                                        }
                                                    }
                                                }
                                            }

                                            if(buscarPeriodoClimaT.rows[0][`p${j}_v`] == null){
                                                const buscarTemperatura = await pool.query(QUERYS.buscarTemperatura, [moment(row3.rows[k]['fecha']).format('YYYY-MM-DD')])
                                                let valH = 0
                                                if(buscarTemperatura.rowCount > 0){
                                                    for(let m = 0; m < 24;m++){
                                                        if(buscarTemperatura.rows[0][`p${m+1}_v`] != null && valH == 0){
                                                            let valorTemperatura = buscarTemperatura.rows[0][`p${m+1}_v`]
                                                            await pool.query(`UPDATE datos_clima SET p${j}_v=${valorTemperatura} WHERE fecha='${moment(row3.rows[k]['fecha']).format('YYYY-MM-DD')}'`)
                                                            valH = 1;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    k++
                                }
                            }
                            saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => Se finalizó el proceso para Pronóstico correctamente\n`)
                        }else{
                            saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => El MC ${fila.aux2} de la BD no se encuentra en el Switch Case\n`)
                        }
                    }else{
                        saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => No se encuentró la Key para Pronóstico\n`)
                    }
                }
            }else{
                saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => No se encuentró Mercados registrados para Pronóstico\n`)
            }
            //FIN DE PRONÓSTICO
            return res.json({ success: true, message: `OK` })
        }else{
            saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => Ya se ha generado el registro para la fecha ${diaAnterior}\n`)
            return res.json({ success: false, message: `Ya se ha generado el registro para la fecha ${diaAnterior}` })
        }
    } catch (error) {
        saveLog(`${moment().format('DD-MM-YYYY HH:mm:ss')} => Error: ${error}\n`)
        return res.json({ success: false, message: `Error: ${error.stack}` })
    }
}