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
  buscarConfigCiudadClima: `SELECT * FROM config_ciudades_clima WHERE db_empresa = $1 AND ucp = $2`,

  // Variantes por ciudad_id de las de arriba -- se usan SOLO contra la
  // copia central (jano_proxy), para que mercados que comparten ciudad
  // lean/escriban la misma fila en vez de una por mercado. La copia de
  // respaldo en la BD de la empresa sigue usando las de arriba (por ucp).
  buscarClimaPeriodosPorCiudad: `SELECT * FROM datos_clima WHERE ciudad_id=$1 AND fecha=$2`,
  buscarFechaClimaPorCiudad: `SELECT * FROM datos_clima WHERE fecha = $1 AND ciudad_id=$2`,
  buscarUltimasFechasClimaPronosticoPorCiudad: `SELECT * FROM datos_clima WHERE ciudad_id=$1 ORDER BY fecha DESC LIMIT $2`,
};
