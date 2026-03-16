export const QUERYS = {
  buscarUltimaFechaClimaLog: `SELECT * FROM datos_climalog WHERE fecha=$1 ORDER BY fecha DESC LIMIT 1`,
  buscarUltimaFechaClima: `SELECT * FROM datos_clima ORDER BY fecha DESC LIMIT 1`,
  buscarKey: `SELECT aux FROM ucp WHERE codigo=$1`,
  cargarUCP: `SELECT DISTINCT(aux2) FROM ucp WHERE codpadre=$1 AND estado=$2 AND aux2!='' ORDER BY aux2 ASC`,
  buscarClimaPeriodos: `SELECT * FROM datos_clima WHERE ucp=$1 AND fecha=$2`,
  agregarClimaPronosticoLog: `INSERT INTO datos_climalog (fecha, ucp) VALUES ($1, $2)`,
  buscarFechaClima: `SELECT * FROM datos_clima WHERE fecha = $1 AND ucp=$2`,
  actualizarFechaClima: `SELECT * FROM datos_clima WHERE fecha = $1 AND ucp=$2`,
  buscarUltimasFechasClimaPronostico: `SELECT * FROM datos_clima WHERE ucp=$1 ORDER BY fecha DESC LIMIT $2`,
  buscarTemperatura: `SELECT * FROM datos_clima WHERE fecha = $1`,
};
