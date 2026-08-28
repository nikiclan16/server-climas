// Migración única (idempotente) para el nuevo sistema de configuración de
// ciudad por mercado (reemplaza el CIUDADES_MAP hardcodeado de
// climaController.js):
//
// 1. Crea config_ciudades_clima y owm_ciudades_co en jano_proxy.
// 2. Importa el catálogo de ciudades de OpenWeatherMap filtrado a Colombia
//    (para el buscador asistido del lado de OpenWeatherMap — su API no
//    tiene búsqueda en vivo por nombre que devuelva el id "clásico").
// 3. Migra los 9 mercados hoy hardcodeados en CIUDADES_MAP, resolviendo a
//    qué empresa (db_empresa) pertenece cada uno recorriendo Redis + la
//    tabla ucp de cada empresa — igual que hace climaController.js hoy.
//
// Uso: node scripts/migrar_config_ciudades_clima.js

// dotenv/config debe ser el PRIMER import: los loaders (redis.js, etc.) leen
// process.env en su propio código de nivel superior al importarse, así que
// las variables de entorno tienen que estar cargadas ANTES de esos imports
// (un dotenv.config() como sentencia normal corre demasiado tarde en ESM,
// después de que todos los imports del archivo ya se resolvieron).
import "dotenv/config";

import pkg from "pg";
const { Pool } = pkg;
import https from "https";
import zlib from "zlib";

import RedisModel from "../src/models/redis.model.js";
import redisClient from "../src/loaders/redis.js";
import { createConectionPG } from "../src/helpers/connections.js";

const poolProxy = new Pool({
  user: process.env.USER_DB,
  host: process.env.HOST_DB,
  database: process.env.NAME_DB,
  password: process.env.PASS_DB,
  port: process.env.PORT_DB,
});

// Copia exacta del CIUDADES_MAP de climaController.js al momento de esta
// migración — se elimina de ahí una vez este script corre exitosamente.
const CIUDADES_MAP = {
  Antioquia: { hist: "107060", pron: "3671950", nombre: "Medellin" },
  Atlantico: { hist: "107123", pron: "3689147", nombre: "Atlantico" },
  Bolivar: { hist: "107563", pron: "3689147", nombre: "Bolivar" },
  Planeta: { hist: "108095", pron: "3689759", nombre: "Planeta" },
  CordobaSucre: { hist: "108095", pron: "3689759", nombre: "CordobaSucre" },
  Sincelejo: { hist: "106776", pron: "3667983", nombre: "Sincelejo" },
  Cesar: { hist: "101957", pron: "3666304", nombre: "Cesar" },
  GM: { hist: "105920", pron: "3668605", nombre: "GM" },
  TubosCaribe: { hist: "107563", pron: "3687238", nombre: "TubosCaribe" },
};

async function crearTablas() {
  await poolProxy.query(`
    CREATE TABLE IF NOT EXISTS config_ciudades_clima (
      id SERIAL PRIMARY KEY,
      db_empresa VARCHAR(255) NOT NULL,
      ucp VARCHAR(255) NOT NULL,
      ciudad_nombre VARCHAR(255),
      accuweather_id VARCHAR(50),
      openweather_id VARCHAR(50),
      creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (db_empresa, ucp)
    );
  `);
  await poolProxy.query(`
    CREATE TABLE IF NOT EXISTS owm_ciudades_co (
      id INTEGER PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      estado VARCHAR(255),
      pais VARCHAR(10) NOT NULL,
      lat DOUBLE PRECISION,
      lon DOUBLE PRECISION
    );
  `);
  console.log("✅ Tablas creadas/verificadas en jano_proxy");
}

function descargarYDescomprimir(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} descargando ${url}`));
          return;
        }
        const gunzip = zlib.createGunzip();
        const chunks = [];
        res.pipe(gunzip);
        gunzip.on("data", (chunk) => chunks.push(chunk));
        gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        gunzip.on("error", reject);
      })
      .on("error", reject);
  });
}

async function importarCiudadesOWM() {
  console.log("\n📥 Descargando catálogo de ciudades de OpenWeatherMap...");
  const json = await descargarYDescomprimir(
    "https://bulk.openweathermap.org/sample/city.list.json.gz",
  );
  const ciudades = JSON.parse(json);
  const colombia = ciudades.filter((c) => c.country === "CO");
  console.log(
    `✅ ${colombia.length} ciudades de Colombia encontradas (de ${ciudades.length} totales)`,
  );

  for (const c of colombia) {
    await poolProxy.query(
      `INSERT INTO owm_ciudades_co (id, nombre, estado, pais, lat, lon)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         estado = EXCLUDED.estado,
         lat = EXCLUDED.lat,
         lon = EXCLUDED.lon`,
      [
        c.id,
        c.name,
        c.state || null,
        c.country,
        c.coord?.lat ?? null,
        c.coord?.lon ?? null,
      ],
    );
  }
  console.log(`✅ ${colombia.length} ciudades importadas/actualizadas en owm_ciudades_co`);
}

async function migrarMercadosExistentes() {
  console.log("\n🔄 Migrando mercados de CIUDADES_MAP a config_ciudades_clima...");
  if (!redisClient.isReady) {
    await new Promise((resolve) => redisClient.once("ready", resolve));
  }
  const redisModel = RedisModel.getInstance();
  const keys = await redisModel.keys("mercados*");
  if (keys.length === 0) {
    console.log("⚠️ No hay mercados en Redis — nada que migrar.");
    return;
  }

  let migrados = 0;
  for (const key of keys) {
    const raw = await redisModel.get(key);
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    const mercado = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
    const session = mercado.accesos;
    if (!session?.basededatos) continue;

    const clientEmpresa = createConectionPG(session);
    try {
      await clientEmpresa.connect();
      const ucpResult = await clientEmpresa.query(
        `SELECT DISTINCT(aux2) AS mc FROM ucp WHERE codpadre=$1 AND estado=$2 AND aux2 IS NOT NULL AND aux2 <> ''`,
        ["2", "1"],
      );
      for (const fila of ucpResult.rows) {
        const ciudadKey = fila.mc?.trim();
        const info = CIUDADES_MAP[ciudadKey];
        if (!info) continue;

        await poolProxy.query(
          `INSERT INTO config_ciudades_clima (db_empresa, ucp, ciudad_nombre, accuweather_id, openweather_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (db_empresa, ucp) DO NOTHING`,
          [session.basededatos, ciudadKey, info.nombre, info.hist, info.pron],
        );
        migrados++;
        console.log(
          `   ✓ ${session.basededatos} / ${ciudadKey} -> ${info.nombre} (hist=${info.hist}, pron=${info.pron})`,
        );
      }
    } catch (err) {
      console.error(`   ❌ Error en empresa ${session?.basededatos}: ${err.message}`);
    } finally {
      await clientEmpresa.end();
    }
  }
  console.log(`\n✅ ${migrados} mapeos migrados.`);
}

async function main() {
  try {
    await crearTablas();
    await importarCiudadesOWM();
    await migrarMercadosExistentes();
    console.log("\n🎉 Migración completa.");
  } catch (err) {
    console.error("❌ Error fatal:", err);
    process.exitCode = 1;
  } finally {
    await poolProxy.end();
    process.exit(process.exitCode ?? 0);
  }
}

main();
