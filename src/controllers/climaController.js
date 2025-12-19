const { Query } = require("pg");
const pool = require("../config");
const { QUERYS } = require("../querys");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
//const HttpProxyAgent = require("http-proxy-agent");
const moment = require("moment");
const { saveLog } = require("../helpers/index");

exports.climaController = async (req, res) => {
  try {
    //const proxyAgent = new HttpProxyAgent.HttpProxyAgent(process.env.URL_PROXY);
    //Validamos que la fecha anterior a la fecha actual este registrada, si no lo está consume la API con los días correspondientes
    const diaAnterior = moment().add(-1, "day").format("YYYY-MM-DD");
    const buscarConsumoAPI2 = await pool.query(
      QUERYS.buscarUltimaFechaClimaLog,
      [diaAnterior]
    );
    if (buscarConsumoAPI2.rowCount == 0) {
      //if(true){
      let totaldias = 0;
      //Tenemos en cuenta la ultima fecha para cargar la o las fecha faltantes hasta el día anterior
      const buscarConsumoAPI = await pool.query(QUERYS.buscarUltimaFechaClima);
      if (buscarConsumoAPI.rowCount > 0) {
        const fechaActual = new Date().getTime();
        const fechaBuscada = new Date(buscarConsumoAPI.rows[0].fecha).getTime();
        totaldias = parseInt(
          (fechaActual - fechaBuscada) / (1000 * 60 * 60 * 24)
        );
      }
      const ucp = await pool.query(QUERYS.cargarUCP, ["2", "1"]);

      //INICIO DE HISTÓRICO
      if (totaldias > 0) {
        let ciudadID = "";
        let ciudad = "";
        //Busca la key de la API
        const bKeyH = await pool.query(QUERYS.buscarKey, [15]);
        if (ucp.rowCount > 0) {
          //if(true){
          for (const fila of ucp.rows) {
            switch (fila.aux2) {
              //switch ("Antioquia"){
              case "Antioquia":
                ciudadID = "107060";
                ciudad = "Medellin";
                break;
            }
            if (bKeyH.rowCount > 0) {
              if (ciudadID != "") {
                const apiHistorico = `http://dataservice.accuweather.com/currentconditions/v1/${ciudadID}/historical/24?apikey=${bKeyH.rows[0].aux}&language=es&details=true`;
                const responseHistorico = await fetch(apiHistorico);
                const dataHistorico = await responseHistorico.json();
                //console.log(JSON.stringify(dataHistorico), "dataHistorico"); // Outputs the fetched data

                saveLog(
                  `${moment().format(
                    "DD-MM-YYYY HH:mm:ss"
                  )} => Se inició el proceso para Históstico correctamente para ${ciudad}\n`
                );
                //Armamos el proceso de almacenamiento en el array
                let arrayHistorico = [];
                let i = 1;
                if (dataHistorico.length > 0) {
                  for (dataH of dataHistorico) {
                    let periodos = {};
                    const dateSplit =
                      dataH.LocalObservationDateTime.split("T")[0];
                    let indexT = `p${i}_t`;
                    let indexH = `p${i}_h`;
                    let indexV = `p${i}_v`;
                    let indexI = `p${i}_i`;

                    const temperatura = dataH.Temperature.Metric.Value;
                    const potencia =
                      13.12 +
                      0.6215 * parseFloat(temperatura) -
                      11.37 *
                        Math.pow(
                          parseFloat(dataH.Wind.Speed.Metric.Value),
                          0.16
                        ) +
                      0.3965 *
                        parseFloat(temperatura) *
                        Math.pow(
                          parseFloat(dataH.Wind.Speed.Metric.Value),
                          0.16
                        );

                    (periodos[indexT] = potencia),
                      (periodos[indexH] = dataH.RelativeHumidity),
                      (periodos[indexV] = dataH.Wind.Speed.Metric.Value);
                    periodos[indexI] = dataH.WeatherIcon;
                    arrayHistorico.push({
                      date: dateSplit,
                      periodos,
                    });
                    i++;
                  }
                  //console.log(arrayHistorico, "arrayHistorico")
                  for (let j = 0; j < 1; j++) {
                    const fechaAnterior = moment()
                      .add(j - 1, "day")
                      .format("YYYY-MM-DD");
                    //Recorremos los 24 periodos
                    for (let p = 0; p < 23; p++) {
                      //Para temperatura
                      const bfechaclimaTemp = await pool.query(
                        QUERYS.buscarClimaPeriodos,
                        [ciudad, fechaAnterior]
                      );
                      if (bfechaclimaTemp.rowCount == 0) {
                        if (p == 0) {
                          await pool.query(QUERYS.agregarClimaPronosticoLog, [
                            fechaAnterior,
                            ciudad,
                          ]); //Guardamos el log de las fechas registradas
                          const valor24 = parseFloat(
                            arrayHistorico[23].periodos[`p24_t`]
                          ).toFixed(4);
                          await pool.query(
                            `INSERT INTO datos_clima (fecha, ucp, p24_t) VALUES ('${fechaAnterior}', '${ciudad}', ${valor24})`
                          );

                          const valor = parseFloat(
                            arrayHistorico[p].periodos[`p${p + 1}_t`]
                          ).toFixed(4);
                          await pool.query(
                            `UPDATE datos_clima SET p${
                              p + 1
                            }_t=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );
                        } else {
                          const valor = parseFloat(
                            arrayHistorico[p].periodos[`p${p + 1}_t`]
                          ).toFixed(4);
                          await pool.query(
                            `INSERT INTO datos_clima (fecha, ucp, p${
                              p + 1
                            }_t) VALUES ('${fechaAnterior}', '${ciudad}', ${valor})`
                          );
                        }
                      } else {
                        if (p == 0) {
                          const valor = parseFloat(
                            arrayHistorico[p].periodos[`p${p + 1}_t`]
                          ).toFixed(4);
                          await pool.query(
                            `UPDATE datos_clima SET p24_t=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );
                        } else {
                          const valor = parseFloat(
                            arrayHistorico[p].periodos[`p${p + 1}_t`]
                          ).toFixed(4);
                          await pool.query(
                            `UPDATE datos_clima SET p${
                              p + 1
                            }_t=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );
                        }
                      }

                      //Para humedad
                      const bfechaclimaHume = await pool.query(
                        QUERYS.buscarClimaPeriodos,
                        [ciudad, fechaAnterior]
                      );
                      if (bfechaclimaHume == null) {
                        const valor = parseFloat(
                          arrayHistorico[p].periodos[`p${p + 1}_h`]
                        ).toFixed(4);
                        await pool.query(
                          `INSERT INTO datos_clima (fecha, ucp, p${
                            p + 1
                          }_h) VALUES ('${fechaAnterior}', '${ciudad}', ${valor})`
                        );
                      } else {
                        if (p == 0) {
                          const valor24 = parseFloat(
                            arrayHistorico[p].periodos[`p${p + 1}_h`]
                          ).toFixed(4);
                          await pool.query(
                            `UPDATE datos_clima SET p24_h=${valor24} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );

                          const valor = parseFloat(
                            arrayHistorico[p].periodos[`p${p + 1}_h`]
                          ).toFixed(4);
                          await pool.query(
                            `UPDATE datos_clima SET p${
                              p + 1
                            }_h=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );
                        } else {
                          const valor = parseFloat(
                            arrayHistorico[p].periodos[`p${p + 1}_h`]
                          ).toFixed(4);
                          await pool.query(
                            `UPDATE datos_clima SET p${
                              p + 1
                            }_h=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );
                        }
                      }

                      //Para velocidad
                      const bfechaclimaVelo = await pool.query(
                        QUERYS.buscarClimaPeriodos,
                        [ciudad, fechaAnterior]
                      );
                      if (bfechaclimaVelo == null) {
                        const valor = parseFloat(
                          arrayHistorico[p].periodos[`p${p + 1}_v`]
                        ).toFixed(4);
                        await pool.query(
                          `INSERT INTO datos_clima (fecha, ucp, p${
                            p + 1
                          }_v) VALUES ('${fechaAnterior}', '${ciudad}', ${valor})`
                        );
                      } else {
                        if (p == 0) {
                          const valor24 = parseFloat(
                            arrayHistorico[p].periodos[`p${p + 1}_v`]
                          ).toFixed(4);
                          await pool.query(
                            `UPDATE datos_clima SET p24_v=${valor24} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );

                          const valor = parseFloat(
                            arrayHistorico[p].periodos[`p${p + 1}_v`]
                          ).toFixed(4);
                          await pool.query(
                            `UPDATE datos_clima SET p${
                              p + 1
                            }_v=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );
                        } else {
                          const valor = parseFloat(
                            arrayHistorico[p].periodos[`p${p + 1}_v`]
                          ).toFixed(4);
                          await pool.query(
                            `UPDATE datos_clima SET p${
                              p + 1
                            }_v=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );
                        }
                      }

                      //Para Icono
                      const bfechaclimaIcono = await pool.query(
                        QUERYS.buscarClimaPeriodos,
                        [ciudad, fechaAnterior]
                      );
                      if (bfechaclimaIcono == null) {
                        const valor = arrayHistorico[p].periodos[`p${p + 1}_i`];
                        await pool.query(
                          `INSERT INTO datos_clima (fecha, ucp, p${
                            p + 1
                          }_i) VALUES ('${fechaAnterior}', '${ciudad}', '${valor}')`
                        );
                      } else {
                        if (p == 0) {
                          const valor24 =
                            arrayHistorico[p].periodos[`p${p + 1}_i`];
                          await pool.query(
                            `UPDATE datos_clima SET p24_i='${valor24}' WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );

                          const valor =
                            arrayHistorico[p].periodos[`p${p + 1}_i`];
                          await pool.query(
                            `UPDATE datos_clima SET p${
                              p + 1
                            }_i='${valor}' WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );
                        } else {
                          const valor =
                            arrayHistorico[p].periodos[`p${p + 1}_i`];
                          await pool.query(
                            `UPDATE datos_clima SET p${
                              p + 1
                            }_i='${valor}' WHERE fecha='${fechaAnterior}' AND ucp='${ciudad}'`
                          );
                        }
                      }
                    }
                  }
                  saveLog(
                    `${moment().format(
                      "DD-MM-YYYY HH:mm:ss"
                    )} => Se culminó el proceso para Históstico correctamente para ${ciudad}\n`
                  );
                } else {
                  console.log("No se encuentró datos de Históricos en la URL");
                  saveLog(
                    `${moment().format(
                      "DD-MM-YYYY HH:mm:ss"
                    )} => No se encuentró datos de Históricos en la URL ${apiHistorico}\n`
                  );
                }
              } else {
                console.log(
                  `El MC ${fila.aux2} de la BD no se encuentra en el Switch Case`
                );
                saveLog(
                  `${moment().format("DD-MM-YYYY HH:mm:ss")} => El MC ${
                    fila.aux2
                  } de la BD no se encuentra en el Switch Case\n`
                );
              }
            } else {
              console.log("No se encuentró la Key para Histórico");
              saveLog(
                `${moment().format(
                  "DD-MM-YYYY HH:mm:ss"
                )} => No se encuentró la Key para Histórico\n`
              );
            }
          }
        } else {
          console.log("No se encuentró Mercados registrados para Histórico");
          saveLog(
            `${moment().format(
              "DD-MM-YYYY HH:mm:ss"
            )} => No se encuentró Mercados registrados para Histórico\n`
          );
        }
      } else {
        console.log("Total días 0");
      }
      //FIN DE HISTÓRICO
      console.log("***** INICIO DE PRONÓSTICO *****");
      //INICIO DE PRONÓSTICO
      const bKeyP = await pool.query(QUERYS.buscarKey, [12]);
      if (ucp.rowCount > 0) {
        let ciudadID = "";
        let ciudad = "";
        //if(true){
        for (const fila of ucp.rows) {
          switch (fila.aux2) {
            //switch ("Antioquia"){
            case "Antioquia":
              ciudadID = "3671950";
              ciudad = "Medellin";
              break;
          }
          if (bKeyP.rowCount > 0) {
            if (ciudadID != "") {
              const apiPronostico = `http://api.openweathermap.org/data/2.5/forecast?id=${ciudadID}&APPID=${bKeyP.rows[0].aux}&units=metric`;
              const responsePronostico = await fetch(apiPronostico);
              const dataPronostico = await responsePronostico.json();
              //console.log(JSON.stringify(dataPronostico), "dataPronostico"); // Outputs the fetched data

              saveLog(
                `${moment().format(
                  "DD-MM-YYYY HH:mm:ss"
                )} => Se inició el proceso para Pronóstico correctamente para ${ciudad}\n`
              );

              if (
                dataPronostico.cod == 200 &&
                dataPronostico.list != undefined &&
                dataPronostico.list.length > 0
              ) {
                for (const dataP of dataPronostico.list) {
                  const fecha = dataP.dt_txt.split(" ");
                  const hora = fecha[1].split(":");

                  //Validando las horas (periodos)
                  let pos = 0;
                  switch (hora[0]) {
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
                      pos = hora[0].replace("0", "");
                      break;
                  }
                  //Declaración de variables climáticas
                  const tem = dataP.main.temp;
                  const hum = dataP.main.humidity;
                  const vel = dataP.wind.speed;
                  const ico = dataP.weather[0].id; // 👈 FIX

                  console.log(ciudad, "<<=ciudad");
                  console.log(ico, "<<=ico");
                  console.log(pos, "pos");
                  console.log("******");

                  //Búsqueda de cada Mercado de comercialización por fecha
                  const search = await pool.query(QUERYS.buscarFechaClima, [
                    fecha[0],
                    ciudad,
                  ]);
                  if (search.rowCount > 0) {
                    //Si existe fecha se actualizan los periodos correspondientes
                    await pool.query(
                      `UPDATE datos_clima SET p${pos}_t=${tem}, p${pos}_h=${hum}, p${pos}_v=${vel}, p${pos}_i='${ico}' WHERE fecha='${fecha[0]}' AND ucp='${ciudad}' RETURNING *`
                    );
                  } else {
                    //Si no existe fecha se agregan los periodos correspondientes
                    const fechaMaxima = moment()
                      .add(12, "days")
                      .format("YYYY-MM-DD");
                    console.log(
                      "fecha punto 1:",
                      fecha,
                      "fecha Maxima:",
                      fechaMaxima
                    );
                    if (fecha[0] <= fechaMaxima) {
                      console.log({ tem, hum, vel, ico });

                      await pool.query(
                        `INSERT INTO datos_clima (fecha, ucp, p${pos}_t, p${pos}_h, p${pos}_v, p${pos}_i) VALUES ('${fecha[0]}', '${ciudad}', ${tem}, ${hum}, ${vel}, '${ico}') RETURNING *`
                      );
                    }
                  }
                } //Este proceso finaliza ingresando los datos de cada mercado en 3, 6, 9, 12, 15, 18, 24 periodos por cada clima

                //Rellenando los valores que hay con cero con el registro anterior: es decir p3 con dato, rellena las dos posiciones anteriores: p1 y p2
                const buscarIconos = await pool.query(
                  QUERYS.buscarUltimasFechasClimaPronostico,
                  [ciudad, 13]
                );
                if (buscarIconos.rowCount > 0) {
                  let k = 0;
                  const periodosConDatos = [3, 6, 9, 12, 15, 18, 21, 24];
                  while (k < buscarIconos.rowCount) {
                    //Recorremos las posiciones que tienen datos
                    let l = 0;
                    while (l < periodosConDatos.length) {
                      const posicionConValor = periodosConDatos[l];
                      switch (posicionConValor) {
                        case 3:
                          arrayPosFaltante = [1, 2];
                          break;
                        case 6:
                          arrayPosFaltante = [4, 5];
                          break;
                        case 9:
                          arrayPosFaltante = [7, 8];
                          break;
                        case 12:
                          arrayPosFaltante = [10, 11];
                          break;
                        case 15:
                          arrayPosFaltante = [13, 14];
                          break;
                        case 18:
                          arrayPosFaltante = [16, 17];
                          break;
                        case 21:
                          arrayPosFaltante = [19, 20];
                          break;
                        case 24:
                          arrayPosFaltante = [22, 23];
                          break;
                      }
                      const valorIcono =
                        buscarIconos.rows[k][`p${posicionConValor}_i`];
                      const fecha = moment(
                        buscarIconos.rows[k][`fecha`]
                      ).format("YYYY-MM-DD");
                      for (j = 0; j < arrayPosFaltante.length; j++) {
                        await pool.query(
                          `UPDATE datos_clima SET p${arrayPosFaltante[j]}_i='${valorIcono}' WHERE fecha='${fecha}' AND ucp='${ciudad}' RETURNING *`
                        );
                        console.log(
                          arrayPosFaltante[j],
                          "posición del periodo icono"
                        );
                      }
                      l++;
                    }
                    k++;
                  }
                }

                //Duplica las variables climaticas de los periodos cargados por cada Mercado de Comercialización hasta llegar a 13 días
                const row = await pool.query(
                  QUERYS.buscarUltimasFechasClimaPronostico,
                  [ciudad, 1]
                );

                if (row.rowCount > 0) {
                  for (let i = 0; i < 7; i++) {
                    const diasiguiente = moment(row.rows[0].fecha)
                      .add(i, "days")
                      .format("YYYY-MM-DD");
                    const search = await pool.query(QUERYS.buscarFechaClima, [
                      diasiguiente,
                      ciudad,
                    ]);
                    if (search.rowCount == 0) {
                      //Si no existe fecha se agregan los periodos correspondientes
                      const fechaMaxima = moment()
                        .add(12, "days")
                        .format("YYYY-MM-DD");
                      console.log(
                        "fecha punto 2:",
                        diasiguiente,
                        "fecha Maxima:",
                        fechaMaxima
                      );
                      if (diasiguiente <= fechaMaxima) {
                        await pool.query(
                          `INSERT INTO datos_clima (fecha, ucp, p1_t, p1_h, p1_v, p1_i) VALUES ('${diasiguiente}', '${ciudad}', ${row.rows[0].p1_t}, ${row.rows[0].p1_h}, ${row.rows[0].p1_v}, '${row.rows[0].p1_i}')`
                        );
                      }
                    }
                    for (let n = 2; n <= 24; n++) {
                      await pool.query(
                        `UPDATE datos_clima SET p${n}_t=${
                          row.rows[0][`p${n}_t`]
                        }, p${n}_h=${row.rows[0][`p${n}_t`]}, p${n}_v=${
                          row.rows[0][`p${n}_v`]
                        }, p${n}_i='${
                          row.rows[0][`p${n}_i`]
                        }' WHERE fecha='${diasiguiente}' AND ucp='${ciudad}' RETURNING *`
                      );
                    }
                  }
                }

                // Función para rellenar los periodos vacíos con el siguiente valor disponible
                const rellenarPeriodos = (dataClima) => {
                  let ultimaTemp = null;
                  let ultimaHum = null;
                  let ultimaVel = null;
                  let ultimaIco = 0;

                  // Primero recorrer hacia adelante para rellenar con el último valor disponible
                  for (let i = 1; i <= 24; i++) {
                    // Temperatura
                    if (dataClima[`p${i}_t`] === null && ultimaTemp !== null) {
                      dataClima[`p${i}_t`] = ultimaTemp;
                    } else if (dataClima[`p${i}_t`] !== null) {
                      ultimaTemp = dataClima[`p${i}_t`];
                    }

                    // Humedad
                    if (dataClima[`p${i}_h`] === null && ultimaHum !== null) {
                      dataClima[`p${i}_h`] = ultimaHum;
                    } else if (dataClima[`p${i}_h`] !== null) {
                      ultimaHum = dataClima[`p${i}_h`];
                    }

                    // Velocidad del viento
                    if (dataClima[`p${i}_v`] === null && ultimaVel !== null) {
                      dataClima[`p${i}_v`] = ultimaVel;
                    } else if (dataClima[`p${i}_v`] !== null) {
                      ultimaVel = dataClima[`p${i}_v`];
                    }

                    // Icono
                    if (dataClima[`p${i}_i`] === 0 && ultimaIco !== 0) {
                      dataClima[`p${i}_i`] = ultimaIco;
                    } else if (dataClima[`p${i}_i`] !== 0) {
                      ultimaIco = dataClima[`p${i}_i`];
                    }
                  }

                  // Ahora rellenar hacia atrás en caso de que los primeros valores (p1, p2, etc.) sean nulos
                  let primerValorTemp = null;
                  let primerValorHum = null;
                  let primerValorVel = null;

                  // Buscar el primer valor no nulo para cada variable
                  for (let i = 1; i <= 24; i++) {
                    if (
                      primerValorTemp === null &&
                      dataClima[`p${i}_t`] !== null
                    ) {
                      primerValorTemp = dataClima[`p${i}_t`];
                    }
                    if (
                      primerValorHum === null &&
                      dataClima[`p${i}_h`] !== null
                    ) {
                      primerValorHum = dataClima[`p${i}_h`];
                    }
                    if (
                      primerValorVel === null &&
                      dataClima[`p${i}_v`] !== null
                    ) {
                      primerValorVel = dataClima[`p${i}_v`];
                    }
                  }

                  // Rellenar hacia atrás si los primeros periodos están vacíos
                  for (let i = 1; i <= 24; i++) {
                    if (
                      dataClima[`p${i}_t`] === null &&
                      primerValorTemp !== null
                    ) {
                      dataClima[`p${i}_t`] = primerValorTemp;
                    }
                    if (
                      dataClima[`p${i}_h`] === null &&
                      primerValorHum !== null
                    ) {
                      dataClima[`p${i}_h`] = primerValorHum;
                    }
                    if (
                      dataClima[`p${i}_v`] === null &&
                      primerValorVel !== null
                    ) {
                      dataClima[`p${i}_v`] = primerValorVel;
                    }
                  }

                  return dataClima;
                };

                // Función para rellenar los días hasta la fecha actual con logging
                const rellenarDiasHastaHoy = async (ciudad, ultimaFecha) => {
                  const fechaActual = moment().format("YYYY-MM-DD");
                  let fechaIterar = moment(ultimaFecha);

                  console.log(
                    `Iniciando relleno de días desde ${ultimaFecha} hasta la fecha actual (${fechaActual}) para la ciudad ${ciudad}`
                  );
                  saveLog(
                    `${moment().format(
                      "DD-MM-YYYY HH:mm:ss"
                    )} => Iniciando relleno de días desde ${ultimaFecha} hasta la fecha actual (${fechaActual}) para la ciudad ${ciudad}\n`
                  );

                  while (fechaIterar.isBefore(fechaActual)) {
                    fechaIterar.add(1, "days");
                    const fechaNueva = fechaIterar.format("YYYY-MM-DD");

                    const search = await pool.query(QUERYS.buscarFechaClima, [
                      fechaNueva,
                      ciudad,
                    ]);

                    if (search.rowCount == 0) {
                      // Obtener los datos del último día registrado
                      const ultimoDiaRegistrado = await pool.query(
                        QUERYS.buscarUltimasFechasClimaPronostico,
                        [ciudad, 1]
                      );
                      let dataClima = ultimoDiaRegistrado.rows[0];

                      // Aplicar la función rellenarPeriodos
                      dataClima = rellenarPeriodos(dataClima);

                      // Insertar el nuevo día con los datos rellenados
                      await pool.query(`
                                                INSERT INTO datos_clima (fecha, ucp, p1_t, p1_h, p1_v, p1_i)
                                                VALUES ('${fechaNueva}', '${ciudad}', ${dataClima.p1_t}, ${dataClima.p1_h}, ${dataClima.p1_v}, '${dataClima.p1_i}')
                                            `);

                      console.log(`Día añadido: ${fechaNueva}`);
                      saveLog(
                        `${moment().format(
                          "DD-MM-YYYY HH:mm:ss"
                        )} => Día añadido: ${fechaNueva} con datos climáticos (T: ${
                          dataClima.p1_t
                        }, H: ${dataClima.p1_h}, V: ${
                          dataClima.p1_v
                        }) para la ciudad ${ciudad}\n`
                      );

                      // Actualizar los periodos de p2 a p24 para el nuevo día
                      for (let n = 2; n <= 24; n++) {
                        await pool.query(`
                                                    UPDATE datos_clima 
                                                    SET p${n}_t=${
                          dataClima[`p${n}_t`]
                        }, p${n}_h=${dataClima[`p${n}_h`]}, p${n}_v=${
                          dataClima[`p${n}_v`]
                        }, p${n}_v='${dataClima[`p${n}_i`]}'
                                                    WHERE fecha='${fechaNueva}' AND ucp='${ciudad}' RETURNING *
                                                `);
                      }
                    } else {
                      console.log(
                        `El día ${fechaNueva} ya existe, no se añade.`
                      );
                      saveLog(
                        `${moment().format(
                          "DD-MM-YYYY HH:mm:ss"
                        )} => El día ${fechaNueva} ya existe, no se añade para la ciudad ${ciudad}\n`
                      );
                    }
                  }

                  console.log(
                    `Proceso de relleno completado hasta la fecha actual (${fechaActual})`
                  );
                  saveLog(
                    `${moment().format(
                      "DD-MM-YYYY HH:mm:ss"
                    )} => Proceso de relleno completado hasta la fecha actual (${fechaActual}) para la ciudad ${ciudad}\n`
                  );
                };

                //Se completa con ello los 12 días
                const row2 = await pool.query(
                  QUERYS.buscarUltimasFechasClimaPronostico,
                  [ciudad, 1]
                );
                const ultimaFecha = await pool.query(
                  `
                                    SELECT MAX(fecha) AS ultima_fecha 
                                    FROM public.datos_clima 
                                    WHERE ucp = $1 AND fecha < CURRENT_DATE
                                `,
                  [ciudad]
                );

                if (row2.rowCount > 0) {
                  await rellenarDiasHastaHoy(
                    ciudad,
                    ultimaFecha.rows[0]?.ultima_fecha
                  );
                  const diasiguiente = moment(row2.rows[0].fecha)
                    .add(1, "days")
                    .format("YYYY-MM-DD");
                  const search = await pool.query(QUERYS.buscarFechaClima, [
                    diasiguiente,
                    ciudad,
                  ]);
                  if (search.rowCount == 0) {
                    //Si no existe fecha se agregan los periodos correspondientes

                    const fechaMaxima = moment()
                      .add(12, "days")
                      .format("YYYY-MM-DD");
                    console.log(
                      "fecha punto 3:",
                      diasiguiente,
                      "fecha Maxima:",
                      fechaMaxima
                    );
                    if (diasiguiente <= fechaMaxima) {
                      await pool.query(
                        `INSERT INTO datos_clima (fecha, ucp, p1_t, p1_h, p1_v, p1_i) VALUES ('${diasiguiente}', '${ciudad}', ${row2.rows[0].p1_t}, ${row2.rows[0].p1_h}, ${row2.rows[0].p1_v}, '${row2.rows[0].p1_i}')`
                      );
                    }
                  }
                  for (let n = 2; n <= 24; n++) {
                    await pool.query(
                      `UPDATE datos_clima SET p${n}_t=${
                        row2.rows[0][`p${n}_t`]
                      }, p${n}_h=${row2.rows[0][`p${n}_t`]}, p${n}_v=${
                        row2.rows[0][`p${n}_v`]
                      }, p${n}_i='${
                        row2.rows[0][`p${n}_i`]
                      }' WHERE fecha='${diasiguiente}' AND ucp='${ciudad}' RETURNING *`
                    );
                  }
                }

                //Bucamos lo ultimos 13 días agregados
                const row3 = await pool.query(
                  QUERYS.buscarUltimasFechasClimaPronostico,
                  [ciudad, 13]
                );
                //console.log(row3.rows, 'Bucamos lo ultimos 13 días agregados')
                if (row3.rowCount > 0) {
                  let k = 0;
                  while (k < row3.rowCount) {
                    // Extraemos los datos climáticos por cada fila (día) de la base de datos
                    let dataClima = row3.rows[k];

                    // Rellenar los periodos vacíos con el siguiente valor no vacío disponible
                    dataClima = rellenarPeriodos(dataClima);

                    // Actualizamos los datos climáticos ya rellenados en la base de datos
                    for (let j = 1; j <= 24; j++) {
                      await pool.query(
                        `UPDATE datos_clima 
                                                 SET p${j}_t = ${
                          dataClima[`p${j}_t`]
                        }, 
                                                     p${j}_h = ${
                          dataClima[`p${j}_h`]
                        }, 
                                                     p${j}_v = ${
                          dataClima[`p${j}_v`]
                        },
                                                     p${j}_i = '${
                          dataClima[`p${j}_i`]
                        }'
                                                 WHERE fecha = '${moment(
                                                   row3.rows[k]["fecha"]
                                                 ).format("YYYY-MM-DD")}' 
                                                 AND ucp = '${ciudad}' 
                                                 RETURNING *`
                      );
                    }
                    k++; // Avanzamos al siguiente día de pronóstico
                  }
                }

                console.log("****FIN*****");
                saveLog(
                  `${moment().format(
                    "DD-MM-YYYY HH:mm:ss"
                  )} => Se finalizó el proceso para Pronóstico correctamente para ${ciudad}\n`
                );
              } else {
                saveLog(
                  `${moment().format(
                    "DD-MM-YYYY HH:mm:ss"
                  )} => No se encuentró datos de Pronóstico en la URL ${apiPronostico}\n`
                );
              }
            } else {
              saveLog(
                `${moment().format("DD-MM-YYYY HH:mm:ss")} => El MC ${
                  fila.aux2
                } de la BD no se encuentra en el Switch Case\n`
              );
            }
          } else {
            saveLog(
              `${moment().format(
                "DD-MM-YYYY HH:mm:ss"
              )} => No se encuentró la Key para Pronóstico\n`
            );
          }
        }
      } else {
        saveLog(
          `${moment().format(
            "DD-MM-YYYY HH:mm:ss"
          )} => No se encuentró Mercados registrados para Pronóstico\n`
        );
      }
      //FIN DE PRONÓSTICO
      if (res != undefined) return res.json({ success: true, message: `OK` });
    } else {
      saveLog(
        `${moment().format(
          "DD-MM-YYYY HH:mm:ss"
        )} => Ya se ha generado el registro para la fecha ${diaAnterior}\n`
      );
      if (res != undefined)
        return res.json({
          success: false,
          message: `Ya se ha generado el registro para la fecha ${diaAnterior}`,
        });
    }
  } catch (error) {
    saveLog(
      `${moment().format("DD-MM-YYYY HH:mm:ss")} => Error: ${error.stack}\n`
    );
    if (res != undefined)
      return res.json({ success: false, message: `Error: ${error.stack}` });
  }
};
