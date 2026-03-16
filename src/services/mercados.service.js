import RedisModel from "../models/redis.model.js";
import Logger from "../helpers/logger.js";
import colors from "colors";

const redisModel = RedisModel.getInstance();

export default class MercadosService {
  static instance;
  static getInstance() {
    if (MercadosService.instance === undefined) {
      MercadosService.instance = new MercadosService();
    }
    return MercadosService.instance;
  }

  //Listando mercados en el perfil superadmin
  listar = async () => {
    try {
      const resultKeys = await redisModel.keys(`mercados*`);

      if (resultKeys.length === 0)
        return {
          success: false,
          message: "No hay mercados creadas en el sistema.",
        };

      const arrNew = [];

      for (let i = 0; i < resultKeys.length; i++) {
        const getInfoData = await redisModel.get(resultKeys[i]);

        // 👇 FIX: parseo defensivo
        const raw = JSON.parse(getInfoData);
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;

        arrNew.push(data);
      }
      return {
        success: true,
        message: "Datos del mercados.",
        data: arrNew,
      };
    } catch (error) {
      Logger.error(colors.red("Error MercadosService Listar "), error);
      throw new Error("ERROR TECNICO");
    }
  };
}
