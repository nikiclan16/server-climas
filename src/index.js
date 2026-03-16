import express from "express";
import routes from "./routes/index.js";
import bodyParser from "body-parser";
import cors from "cors";
import colors from "colors";
import dotenv from "dotenv";
import cron from "node-cron";
import { climaController } from "./controllers/climaController.js";

dotenv.config();

async function startServer() {
  // Crear el servidor
  const app = express();

  // Habilitar cors
  app.use(cors());
  app.options("*", cors());

  // Habilitar bodyparser
  app.use(bodyParser.json({ limit: "200mb" }));
  app.use(bodyParser.urlencoded({ limit: "200mb", extended: true }));

  // Rutas de la app
  app.use("/", routes());

  // Cargando pgTools
  await import("./config/index.js");

  // Puerto
  app.listen(process.env.PORT, () => {
    console.info(`${colors.yellow("########################################################")}
        ${colors.green(`Server ${colors.blue(process.env.PROYECT)} listening on port:`)} ${colors.blue(process.env.PORT)}  🛡️
        ${colors.yellow("########################################################")}`);
  });

  // Schedule automatic process
  cron.schedule("00 5 * * *", () => {
    // All days at 5:00AM
    climaController();
  });
}

startServer()
  .then(() => console.info(colors.green("Done ✌️")))
  .catch((error) =>
    console.error(colors.red("error when starting the api"), error),
  );
