import fetch from "node-fetch";
import moment from "moment";
import { saveLog } from "../helpers/index.js";
import { QUERYS } from "../querys/index.js";
import pool from "../config/index.js";
import { createConectionPG } from "../helpers/connections.js";
import MercadosService from "../services/mercados.service.js";

const mercadosService = MercadosService.getInstance();

// ─── Helper: ejecutar query en ambas DBs en paralelo ─────────────────────────
/**
 * Ejecuta la misma query en jano_proxy (pool) y en la DB de la empresa (clientEmpresa).
 * Si falla en la empresa solo loguea el error, nunca interrumpe el flujo principal.
 * Siempre retorna el resultado de jano_proxy.
 */
const queryDual = async (clientEmpresa, sql, params = []) => {
  const results = await Promise.allSettled([
    params.length ? pool.query(sql, params) : pool.query(sql),
    params.length ? clientEmpresa.query(sql, params) : clientEmpresa.query(sql),
  ]);

  if (results[1].status === "rejected") {
    saveLog(
      `${moment().format("DD-MM-YYYY HH:mm:ss")} => [EMPRESA] Error en query dual: ${results[1].reason?.message} | SQL: ${sql.slice(0, 120)}\n`,
    );
  }

  if (results[0].status === "rejected") throw results[0].reason;
  return results[0].value;
};

// ─── Helpers locales ─────────────────────────────────────────────────────────

const rellenarPeriodos = (dataClima) => {
  let ultimaTemp = null;
  let ultimaHum = null;
  let ultimaVel = null;
  let ultimaIco = 0;

  for (let i = 1; i <= 24; i++) {
    if (dataClima[`p${i}_t`] === null && ultimaTemp !== null)
      dataClima[`p${i}_t`] = ultimaTemp;
    else if (dataClima[`p${i}_t`] !== null) ultimaTemp = dataClima[`p${i}_t`];

    if (dataClima[`p${i}_h`] === null && ultimaHum !== null)
      dataClima[`p${i}_h`] = ultimaHum;
    else if (dataClima[`p${i}_h`] !== null) ultimaHum = dataClima[`p${i}_h`];

    if (dataClima[`p${i}_v`] === null && ultimaVel !== null)
      dataClima[`p${i}_v`] = ultimaVel;
    else if (dataClima[`p${i}_v`] !== null) ultimaVel = dataClima[`p${i}_v`];

    if (dataClima[`p${i}_i`] === 0 && ultimaIco !== 0)
      dataClima[`p${i}_i`] = ultimaIco;
    else if (dataClima[`p${i}_i`] !== 0) ultimaIco = dataClima[`p${i}_i`];
  }

  let primerTemp = null,
    primerHum = null,
    primerVel = null;
  for (let i = 1; i <= 24; i++) {
    if (primerTemp === null && dataClima[`p${i}_t`] !== null)
      primerTemp = dataClima[`p${i}_t`];
    if (primerHum === null && dataClima[`p${i}_h`] !== null)
      primerHum = dataClima[`p${i}_h`];
    if (primerVel === null && dataClima[`p${i}_v`] !== null)
      primerVel = dataClima[`p${i}_v`];
  }
  for (let i = 1; i <= 24; i++) {
    if (dataClima[`p${i}_t`] === null && primerTemp !== null)
      dataClima[`p${i}_t`] = primerTemp;
    if (dataClima[`p${i}_h`] === null && primerHum !== null)
      dataClima[`p${i}_h`] = primerHum;
    if (dataClima[`p${i}_v`] === null && primerVel !== null)
      dataClima[`p${i}_v`] = primerVel;
  }

  return dataClima;
};

const rellenarDiasHastaHoy = async (ucpMC, ultimaFecha, clientEmpresa) => {
  const fechaActual = moment().format("YYYY-MM-DD");
  let fechaIterar = moment(ultimaFecha);

  saveLog(
    `${moment().format("DD-MM-YYYY HH:mm:ss")} => Iniciando relleno desde ${ultimaFecha} hasta ${fechaActual} para ${ucpMC}\n`,
  );

  while (fechaIterar.isBefore(fechaActual)) {
    fechaIterar.add(1, "days");
    const fechaNueva = fechaIterar.format("YYYY-MM-DD");

    const search = await pool.query(QUERYS.buscarFechaClima, [
      fechaNueva,
      ucpMC,
    ]);
    if (search.rowCount === 0) {
      const ultimoDia = await pool.query(
        QUERYS.buscarUltimasFechasClimaPronostico,
        [ucpMC, 1],
      );
      let dataClima = rellenarPeriodos(ultimoDia.rows[0]);

      await queryDual(
        clientEmpresa,
        `INSERT INTO datos_clima (fecha, ucp, p1_t, p1_h, p1_v, p1_i) VALUES ('${fechaNueva}', '${ucpMC}', ${dataClima.p1_t}, ${dataClima.p1_h}, ${dataClima.p1_v}, '${dataClima.p1_i}')`,
      );
      for (let n = 2; n <= 24; n++) {
        await queryDual(
          clientEmpresa,
          `UPDATE datos_clima SET p${n}_t=${dataClima[`p${n}_t`]}, p${n}_h=${dataClima[`p${n}_h`]}, p${n}_v=${dataClima[`p${n}_v`]}, p${n}_i='${dataClima[`p${n}_i`]}' WHERE fecha='${fechaNueva}' AND ucp='${ucpMC}'`,
        );
      }
      saveLog(
        `${moment().format("DD-MM-YYYY HH:mm:ss")} => Día añadido: ${fechaNueva} para ${ucpMC}\n`,
      );
    }
  }
};

// ─── Llamadas a las APIs externas (una sola vez por ciudad, ver más abajo) ───
const fetchHistorico = async (ciudadID_hist, keyHist) => {
  const apiHistorico = `http://dataservice.accuweather.com/currentconditions/v1/${ciudadID_hist}/historical/24?apikey=${keyHist}&language=es&details=true`;
  const responseHistorico = await fetch(apiHistorico);
  return await responseHistorico.json();
};

const fetchPronostico = async (ciudadID_pron, keyPron) => {
  const apiPronostico = `http://api.openweathermap.org/data/2.5/forecast?id=${ciudadID_pron}&APPID=${keyPron}&units=metric`;
  const responsePronostico = await fetch(apiPronostico);
  return await responsePronostico.json();
};

// ─── Procesador por mercado ───────────────────────────────────────────────────
// dataHistorico/dataPronostico ya vienen descargados (una sola vez por
// ciudad, ver climaController) — acá solo se escribe, por mercado, usando
// esos mismos datos. Así dos mercados que comparten ciudad no duplican la
// llamada a AccuWeather/OpenWeatherMap.
const procesarMercado = async (
  clientEmpresa,
  ucpMC,
  ciudad,
  dataHistorico,
  dataPronostico,
) => {
  const log = (msg) =>
    saveLog(`${moment().format("DD-MM-YYYY HH:mm:ss")} => ${msg}\n`);

  // ── HISTÓRICO ──────────────────────────────────────────────────────────────
  if (dataHistorico) {
    try {
      log(`Iniciando Histórico para ${ciudad}`);

      if (dataHistorico.length > 0) {
        let arrayHistorico = [];
        let i = 1;
        for (const dataH of dataHistorico) {
          const temperatura = dataH.Temperature.Metric.Value;
          const potencia =
            13.12 +
            0.6215 * parseFloat(temperatura) -
            11.37 * Math.pow(parseFloat(dataH.Wind.Speed.Metric.Value), 0.16) +
            0.3965 *
              parseFloat(temperatura) *
              Math.pow(parseFloat(dataH.Wind.Speed.Metric.Value), 0.16);

          arrayHistorico.push({
            periodos: {
              [`p${i}_t`]: potencia,
              [`p${i}_h`]: dataH.RelativeHumidity,
              [`p${i}_v`]: dataH.Wind.Speed.Metric.Value,
              [`p${i}_i`]: dataH.WeatherIcon,
            },
          });
          i++;
        }

        const fechaAnterior = moment().add(-1, "day").format("YYYY-MM-DD");

        for (let p = 0; p < 23; p++) {
          // Lectura solo desde jano_proxy como fuente de verdad
          const bfecha = await pool.query(QUERYS.buscarClimaPeriodos, [
            ucpMC,
            fechaAnterior,
          ]);

          if (bfecha.rowCount === 0) {
            if (p === 0) {
              // Log dual (datos_climalog también se replica)
              await queryDual(clientEmpresa, QUERYS.agregarClimaPronosticoLog, [
                fechaAnterior,
                ucpMC,
              ]);
              const valor24 = parseFloat(
                arrayHistorico[23].periodos[`p24_t`],
              ).toFixed(4);
              await queryDual(
                clientEmpresa,
                `INSERT INTO datos_clima (fecha, ucp, p24_t) VALUES ('${fechaAnterior}', '${ucpMC}', ${valor24})`,
              );
            }
            const valor = parseFloat(
              arrayHistorico[p].periodos[`p${p + 1}_t`],
            ).toFixed(4);
            await queryDual(
              clientEmpresa,
              `UPDATE datos_clima SET p${p + 1}_t=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ucpMC}'`,
            );
          } else {
            const campoRef = p === 0 ? "p24_t" : `p${p + 1}_t`;
            const valor = parseFloat(
              arrayHistorico[p].periodos[`p${p + 1}_t`],
            ).toFixed(4);
            await queryDual(
              clientEmpresa,
              `UPDATE datos_clima SET ${campoRef}=${valor} WHERE fecha='${fechaAnterior}' AND ucp='${ucpMC}'`,
            );
          }

          const valor_h = parseFloat(
            arrayHistorico[p].periodos[`p${p + 1}_h`],
          ).toFixed(4);
          if (p === 0)
            await queryDual(
              clientEmpresa,
              `UPDATE datos_clima SET p24_h=${valor_h} WHERE fecha='${fechaAnterior}' AND ucp='${ucpMC}'`,
            );
          await queryDual(
            clientEmpresa,
            `UPDATE datos_clima SET p${p + 1}_h=${valor_h} WHERE fecha='${fechaAnterior}' AND ucp='${ucpMC}'`,
          );

          const valor_v = parseFloat(
            arrayHistorico[p].periodos[`p${p + 1}_v`],
          ).toFixed(4);
          if (p === 0)
            await queryDual(
              clientEmpresa,
              `UPDATE datos_clima SET p24_v=${valor_v} WHERE fecha='${fechaAnterior}' AND ucp='${ucpMC}'`,
            );
          await queryDual(
            clientEmpresa,
            `UPDATE datos_clima SET p${p + 1}_v=${valor_v} WHERE fecha='${fechaAnterior}' AND ucp='${ucpMC}'`,
          );

          const valor_i = arrayHistorico[p].periodos[`p${p + 1}_i`];
          if (p === 0)
            await queryDual(
              clientEmpresa,
              `UPDATE datos_clima SET p24_i='${valor_i}' WHERE fecha='${fechaAnterior}' AND ucp='${ucpMC}'`,
            );
          await queryDual(
            clientEmpresa,
            `UPDATE datos_clima SET p${p + 1}_i='${valor_i}' WHERE fecha='${fechaAnterior}' AND ucp='${ucpMC}'`,
          );
        }

        log(`Histórico completado para ${ciudad}`);
      } else {
        log(`Sin datos históricos en la URL para ${ciudad}`);
      }
    } catch (err) {
      log(`Error en Histórico para ${ciudad}: ${err.message}`);
    }
  }

  // ── PRONÓSTICO ─────────────────────────────────────────────────────────────
  if (!dataPronostico) return;

  try {
    log(`Iniciando Pronóstico para ${ciudad}`);

    if (dataPronostico.cod == 200 && dataPronostico.list?.length > 0) {
      for (const dataP of dataPronostico.list) {
        const fecha = dataP.dt_txt.split(" ");
        const hora = fecha[1].split(":");
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
            pos = parseInt(hora[0]);
            break;
        }
        const tem = dataP.main.temp;
        const hum = dataP.main.humidity;
        const vel = dataP.wind.speed;
        const ico = dataP.weather[0].id;

        const search = await pool.query(QUERYS.buscarFechaClima, [
          fecha[0],
          ucpMC,
        ]);
        if (search.rowCount > 0) {
          await queryDual(
            clientEmpresa,
            `UPDATE datos_clima SET p${pos}_t=${tem}, p${pos}_h=${hum}, p${pos}_v=${vel}, p${pos}_i='${ico}' WHERE fecha='${fecha[0]}' AND ucp='${ucpMC}'`,
          );
        } else {
          const fechaMaxima = moment().add(12, "days").format("YYYY-MM-DD");
          if (fecha[0] <= fechaMaxima) {
            await queryDual(
              clientEmpresa,
              `INSERT INTO datos_clima (fecha, ucp, p${pos}_t, p${pos}_h, p${pos}_v, p${pos}_i) VALUES ('${fecha[0]}', '${ucpMC}', ${tem}, ${hum}, ${vel}, '${ico}')`,
            );
          }
        }
      }

      // Rellenar iconos faltantes
      const buscarIconos = await pool.query(
        QUERYS.buscarUltimasFechasClimaPronostico,
        [ucpMC, 13],
      );
      if (buscarIconos.rowCount > 0) {
        const periodosConDatos = [3, 6, 9, 12, 15, 18, 21, 24];
        const mapFaltantes = {
          3: [1, 2],
          6: [4, 5],
          9: [7, 8],
          12: [10, 11],
          15: [13, 14],
          18: [16, 17],
          21: [19, 20],
          24: [22, 23],
        };
        for (const rowIcono of buscarIconos.rows) {
          const fecha = moment(rowIcono.fecha).format("YYYY-MM-DD");
          for (const pos of periodosConDatos) {
            const valorIcono = rowIcono[`p${pos}_i`];
            for (const faltante of mapFaltantes[pos]) {
              await queryDual(
                clientEmpresa,
                `UPDATE datos_clima SET p${faltante}_i='${valorIcono}' WHERE fecha='${fecha}' AND ucp='${ucpMC}'`,
              );
            }
          }
        }
      }

      // Duplicar días hasta 12 días adelante
      const row = await pool.query(QUERYS.buscarUltimasFechasClimaPronostico, [
        ucpMC,
        1,
      ]);
      if (row.rowCount > 0) {
        for (let i = 0; i < 7; i++) {
          const diasiguiente = moment(row.rows[0].fecha)
            .add(i, "days")
            .format("YYYY-MM-DD");
          const search = await pool.query(QUERYS.buscarFechaClima, [
            diasiguiente,
            ucpMC,
          ]);
          const fechaMaxima = moment().add(12, "days").format("YYYY-MM-DD");
          if (search.rowCount === 0 && diasiguiente <= fechaMaxima) {
            await queryDual(
              clientEmpresa,
              `INSERT INTO datos_clima (fecha, ucp, p1_t, p1_h, p1_v, p1_i) VALUES ('${diasiguiente}', '${ucpMC}', ${row.rows[0].p1_t}, ${row.rows[0].p1_h}, ${row.rows[0].p1_v}, '${row.rows[0].p1_i}')`,
            );
          }
          for (let n = 2; n <= 24; n++) {
            await queryDual(
              clientEmpresa,
              `UPDATE datos_clima SET p${n}_t=${row.rows[0][`p${n}_t`]}, p${n}_h=${row.rows[0][`p${n}_t`]}, p${n}_v=${row.rows[0][`p${n}_v`]}, p${n}_i='${row.rows[0][`p${n}_i`]}' WHERE fecha='${diasiguiente}' AND ucp='${ucpMC}'`,
            );
          }
        }
      }

      // Rellenar días hasta hoy si hay huecos
      const row2 = await pool.query(QUERYS.buscarUltimasFechasClimaPronostico, [
        ucpMC,
        1,
      ]);
      const ultimaFecha = await pool.query(
        `SELECT MAX(fecha) AS ultima_fecha FROM public.datos_clima WHERE ucp = $1 AND fecha < CURRENT_DATE`,
        [ucpMC],
      );
      if (row2.rowCount > 0) {
        await rellenarDiasHastaHoy(
          ucpMC,
          ultimaFecha.rows[0]?.ultima_fecha,
          clientEmpresa,
        );
        const diasiguiente = moment(row2.rows[0].fecha)
          .add(1, "days")
          .format("YYYY-MM-DD");
        const search = await pool.query(QUERYS.buscarFechaClima, [
          diasiguiente,
          ucpMC,
        ]);
        const fechaMaxima = moment().add(12, "days").format("YYYY-MM-DD");
        if (search.rowCount === 0 && diasiguiente <= fechaMaxima) {
          await queryDual(
            clientEmpresa,
            `INSERT INTO datos_clima (fecha, ucp, p1_t, p1_h, p1_v, p1_i) VALUES ('${diasiguiente}', '${ucpMC}', ${row2.rows[0].p1_t}, ${row2.rows[0].p1_h}, ${row2.rows[0].p1_v}, '${row2.rows[0].p1_i}')`,
          );
        }
        for (let n = 2; n <= 24; n++) {
          await queryDual(
            clientEmpresa,
            `UPDATE datos_clima SET p${n}_t=${row2.rows[0][`p${n}_t`]}, p${n}_h=${row2.rows[0][`p${n}_t`]}, p${n}_v=${row2.rows[0][`p${n}_v`]}, p${n}_i='${row2.rows[0][`p${n}_i`]}' WHERE fecha='${diasiguiente}' AND ucp='${ucpMC}'`,
          );
        }
      }

      // Relleno final de periodos vacíos en los últimos 13 días
      const row3 = await pool.query(QUERYS.buscarUltimasFechasClimaPronostico, [
        ucpMC,
        13,
      ]);
      if (row3.rowCount > 0) {
        for (const rowDia of row3.rows) {
          const dataClima = rellenarPeriodos(rowDia);
          const fechaDia = moment(rowDia.fecha).format("YYYY-MM-DD");
          for (let j = 1; j <= 24; j++) {
            await queryDual(
              clientEmpresa,
              `UPDATE datos_clima SET p${j}_t=${dataClima[`p${j}_t`]}, p${j}_h=${dataClima[`p${j}_h`]}, p${j}_v=${dataClima[`p${j}_v`]}, p${j}_i='${dataClima[`p${j}_i`]}' WHERE fecha='${fechaDia}' AND ucp='${ucpMC}'`,
            );
          }
        }
      }

      log(`Pronóstico finalizado para ${ciudad}`);
    } else {
      log(`Sin datos de pronóstico para ${ciudad}`);
    }
  } catch (err) {
    log(`Error en Pronóstico para ${ciudad}: ${err.message}`);
  }
};

// ─── Config de ciudad por mercado ───────────────────────────────────────────
// Antes era un objeto hardcodeado (CIUDADES_MAP); ahora cada empresa
// configura su propia ciudad por mercado desde Configuración (pronosticos
// frontend), guardada en config_ciudades_clima (jano_proxy), scoped por
// db_empresa — así cada empresa solo ve/edita sus propios mercados aunque
// la tabla sea centralizada. Ver scripts/migrar_config_ciudades_clima.js
// para la migración inicial de los mercados que antes vivían en el objeto.
const buscarInfoCiudad = async (dbEmpresa, ciudadKey) => {
  const result = await pool.query(QUERYS.buscarConfigCiudadClima, [
    dbEmpresa,
    ciudadKey,
  ]);
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return {
    hist: row.accuweather_id,
    pron: row.openweather_id,
    nombre: row.ciudad_nombre || ciudadKey,
  };
};

// ─── Controller principal ─────────────────────────────────────────────────────
export const climaController = async (req, res) => {
  try {
    const diaAnterior = moment().add(-1, "day").format("YYYY-MM-DD");

    // Verificar si ya se procesó hoy (sobre jano_proxy)
    const buscarLog = await pool.query(QUERYS.buscarUltimaFechaClimaLog, [
      diaAnterior,
    ]);
    if (buscarLog.rowCount > 0) {
      saveLog(
        `${moment().format("DD-MM-YYYY HH:mm:ss")} => Ya se generó el registro para ${diaAnterior}\n`,
      );
      if (res)
        return res.json({
          success: false,
          message: `Ya se ha generado el registro para la fecha ${diaAnterior}`,
        });
      return;
    }

    // Calcular cuántos días faltan (sobre jano_proxy)
    let totaldias = 0;
    const buscarUltimaFecha = await pool.query(QUERYS.buscarUltimaFechaClima);
    if (buscarUltimaFecha.rowCount > 0) {
      const fechaActual = new Date().getTime();
      const fechaBuscada = new Date(buscarUltimaFecha.rows[0].fecha).getTime();
      totaldias = parseInt(
        (fechaActual - fechaBuscada) / (1000 * 60 * 60 * 24),
      );
    }

    // ── Obtener todos los mercados desde Redis ────────────────────────────────
    const resultMercados = await mercadosService.listar();
    if (!resultMercados.success || !resultMercados.data?.length) {
      saveLog(
        `${moment().format("DD-MM-YYYY HH:mm:ss")} => No hay mercados en Redis\n`,
      );
      if (res)
        return res.json({
          success: false,
          message: "No hay mercados en Redis",
        });
      return;
    }

    // ── PASE 1: recolectar mercado+ciudad de cada empresa, sin llamar
    // todavía a AccuWeather/OpenWeatherMap ────────────────────────────────────
    const trabajos = []; // { clientEmpresa, ucpMC, ciudadID_hist, ciudadID_pron, ciudadNombre, keyHist, keyPron }
    const clientesEmpresa = [];

    for (const mercado of resultMercados.data) {
      const session = mercado.accesos;
      const clientEmpresa = createConectionPG(session);
      clientesEmpresa.push(clientEmpresa);

      try {
        await clientEmpresa.connect();

        const ucpResult = await clientEmpresa.query(QUERYS.cargarUCP, [
          "2",
          "1",
        ]);
        const ucpRows = ucpResult.rows;

        const bKeyH = await clientEmpresa.query(QUERYS.buscarKey, [15]);
        const bKeyP = await clientEmpresa.query(QUERYS.buscarKey, [12]);
        const keyHist = bKeyH.rowCount > 0 ? bKeyH.rows[0].aux : null;
        const keyPron = bKeyP.rowCount > 0 ? bKeyP.rows[0].aux : null;

        if (!ucpRows.length) {
          saveLog(
            `${moment().format("DD-MM-YYYY HH:mm:ss")} => Sin UCPs en ${session?.basededatos}\n`,
          );
          continue;
        }

        for (const fila of ucpRows) {
          const ciudadKey = fila.aux2?.trim();
          const ciudadInfo = await buscarInfoCiudad(
            session?.basededatos,
            ciudadKey,
          );

          if (!ciudadInfo) {
            saveLog(
              `${moment().format("DD-MM-YYYY HH:mm:ss")} => UCP "${ciudadKey}" sin ciudad configurada en config_ciudades_clima (empresa: ${session?.basededatos}) — configúrala en Configuración > Clima\n`,
            );
            continue;
          }

          trabajos.push({
            clientEmpresa,
            ucpMC: ciudadKey,
            ciudadID_hist: ciudadInfo.hist,
            ciudadID_pron: ciudadInfo.pron,
            ciudadNombre: ciudadInfo.nombre,
            keyHist,
            keyPron,
          });
        }
      } catch (err) {
        saveLog(
          `${moment().format("DD-MM-YYYY HH:mm:ss")} => Error en empresa ${session?.basededatos}: ${err.message}\n`,
        );
      }
    }

    // ── PASE 2: agrupar por ciudad (mismo par de IDs AccuWeather/OWM = los
    // mismos datos, sin importar qué mercado/empresa los pidió) y llamar a
    // la API UNA sola vez por grupo — así dos mercados que comparten ciudad
    // no duplican el consumo de cupo de AccuWeather/OpenWeatherMap ───────────
    const grupos = new Map();
    for (const trabajo of trabajos) {
      const key = `${trabajo.ciudadID_hist || ""}|${trabajo.ciudadID_pron || ""}`;
      if (!grupos.has(key)) grupos.set(key, { ...trabajo, trabajos: [] });
      grupos.get(key).trabajos.push(trabajo);
    }

    try {
      for (const grupo of grupos.values()) {
        if (grupo.trabajos.length > 1) {
          saveLog(
            `${moment().format("DD-MM-YYYY HH:mm:ss")} => Ciudad compartida por ${grupo.trabajos.length} mercados (${grupo.trabajos.map((t) => t.ucpMC).join(", ")}) — 1 sola llamada a la API\n`,
          );
        }

        let dataHistorico = null;
        if (totaldias > 0 && grupo.ciudadID_hist && grupo.keyHist) {
          try {
            dataHistorico = await fetchHistorico(
              grupo.ciudadID_hist,
              grupo.keyHist,
            );
          } catch (err) {
            saveLog(
              `${moment().format("DD-MM-YYYY HH:mm:ss")} => Error descargando histórico para ${grupo.ciudadNombre}: ${err.message}\n`,
            );
          }
        }

        let dataPronostico = null;
        if (grupo.ciudadID_pron && grupo.keyPron) {
          try {
            dataPronostico = await fetchPronostico(
              grupo.ciudadID_pron,
              grupo.keyPron,
            );
          } catch (err) {
            saveLog(
              `${moment().format("DD-MM-YYYY HH:mm:ss")} => Error descargando pronóstico para ${grupo.ciudadNombre}: ${err.message}\n`,
            );
          }
        }

        for (const trabajo of grupo.trabajos) {
          await procesarMercado(
            trabajo.clientEmpresa,
            trabajo.ucpMC,
            trabajo.ciudadNombre,
            dataHistorico,
            dataPronostico,
          );
        }
      }
    } finally {
      // Cerrar todas las conexiones de empresa usadas, pase lo que pase en
      // el pase 2 (misma garantía que el finally por-mercado que había antes).
      for (const clientEmpresa of clientesEmpresa) {
        await clientEmpresa.end();
      }
    }

    if (res) return res.json({ success: true, message: "OK" });
  } catch (error) {
    saveLog(
      `${moment().format("DD-MM-YYYY HH:mm:ss")} => Error: ${error.stack}\n`,
    );
    if (res)
      return res.json({ success: false, message: `Error: ${error.stack}` });
  }
};
