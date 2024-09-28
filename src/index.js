const express = require("express");
const routes = require("./routes");
const bodyParser = require("body-parser");
const cors =  require("cors");
const colors = require("colors")
require('dotenv').config()
const cron = require('node-cron')
const { climaController } = require('./controllers/climaController')

async function startServer() {
    //crear el servidor
    const app = express();

    //Habilito cors
    app.use(cors());
    app.options('*', cors());

    //habilitar bodyparser
    app.use(bodyParser.json({limit: '200mb'}));
    app.use(bodyParser.urlencoded({limit: '200mb', extended: true }));

    //Rutas de la app
    app.use("/", routes());

    //Cargando pgTools
    await require('./config')
    //puerto
    app.listen(process.env.PORT, () => {
        console.info(`${colors.yellow('########################################################')}
        ${colors.green(`Server ${colors.blue(process.env.PROYECT)} listening on port:`)} ${colors.blue(process.env.PORT)}  🛡️
        ${colors.yellow('########################################################')}`);
    });
    //Schedule automatic of process
    cron.schedule('00 5 * * *', () =>{
        //All days a the 5:00AM
        //console.log('***')
        climaController()
    })
}

startServer()
.then(() => console.info(colors.green('Done ✌️')))
.catch((error) => console.error(colors.red('error when starting the api'), error))