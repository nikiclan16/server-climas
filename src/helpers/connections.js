import { Pool } from "pg";
import colors from "colors";
import Logger from "../helpers/logger.js";

// Cache de pools por mercado para reutilizarlos
const mercadosPools = new Map();

export const createConectionPG = (credentials) => {
  // Crear una key única para este pool basada en las credenciales
  const poolKey = `${credentials.host}:${credentials.basededatos}:${credentials.usuario}`;

  // Si ya existe un pool para esta mercado, reutilizarlo
  if (!mercadosPools.has(poolKey)) {
    const newPool = new Pool({
      user: credentials.usuario,
      password: credentials.contrasenia,
      host: credentials.host,
      database: credentials.basededatos,
      port: +credentials.puerto || 5432,
      max: 10, // Máximo de conexiones por mercado
      idleTimeoutMillis: 100000,
      connectionTimeoutMillis: 5000,
    });

    newPool.on("error", (err, client) => {
      Logger.error(`Pool error para ${poolKey}:`, err);
    });

    mercadosPools.set(poolKey, newPool);
    Logger.info(
      colors.green(`✓ Nuevo pool creado para: ${credentials.basededatos}`),
    );
  }

  const pool = mercadosPools.get(poolKey);
  let poolClient = null;

  return {
    async connect() {
      if (!poolClient) {
        poolClient = await pool.connect();
      }
    },

    async query(...args) {
      if (!poolClient) {
        return pool.query(...args);
      }
      return poolClient.query(...args);
    },

    async end() {
      if (poolClient) {
        poolClient.release();
        poolClient = null;
      }
    },

    get processID() {
      return poolClient ? poolClient.processID : null;
    },
  };
};

// Función para limpiar pools (útil para testing o restart)
export const closeAllPools = async () => {
  for (const [key, pool] of mercadosPools.entries()) {
    await pool.end();
    Logger.info(`Pool cerrado: ${key}`);
  }
  mercadosPools.clear();
};
