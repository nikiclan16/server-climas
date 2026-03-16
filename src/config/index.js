import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const poolConfig = {
  database: process.env.NAME_DB,
  host: process.env.HOST_DB,
  user: process.env.USER_DB,
  password: process.env.PASS_DB,
  port: process.env.PORT_DB,
  max: 5,
  idleTimeoutMillis: 40000,
};

const pool = new Pool(poolConfig);

export default pool;
