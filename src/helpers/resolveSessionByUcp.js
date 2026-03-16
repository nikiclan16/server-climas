// helpers/resolveSessionByUcp.js
import { createConectionPG } from "./connections.js";
import MercadosService from "../services/mercados.service.js";

const mercadosService = MercadosService.getInstance();

export const resolveSessionByUcp = async (ucp) => {
  const result = await mercadosService.listar();

  if (!result.success || !result.data) return null;

  const mercados = result.data;

  for (const mercado of mercados) {
    const session = mercado.accesos;
    const client = createConectionPG(session);

    try {
      await client.connect();
      const found = await client.query(
        `SELECT 1 FROM ucp WHERE LOWER(aux2) = LOWER($1) AND codpadre = 2 AND estado = 1 LIMIT 1`,
        [ucp],
      );

      if (found.rows.length > 0) {
        return session;
      }
    } catch (err) {
      continue;
    } finally {
      await client.end();
    }
  }

  return null;
};
