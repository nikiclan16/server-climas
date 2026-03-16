import colors from "colors";
import Logger from "../helpers/logger.js";
import { createClient } from "redis";

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
  },
  password: process.env.REDIS_PASSWORD || undefined,
  database: Number(process.env.REDIS_DATABASE) || 0,
});

/**
 * Eventos
 */
client.on("error", (err) => {
  Logger.error("Ha ocurrido un error en Redis", err);
});

client.on("connect", () => {
  Logger.info(colors.yellow("Connecting to Redis..."));
});

client.on("ready", () => {
  Logger.info(colors.green("Redis loaded and connected! ✌️"));
});

/**
 * Conexión inicial
 */
const connectRedis = async () => {
  try {
    await client.connect();
  } catch (err) {
    Logger.error(
      "Ha ocurrido un error al conectar a la base de datos Redis",
      err,
    );
  }
};

connectRedis();

export default client;
