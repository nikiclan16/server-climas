const express = require("express");
const { climaController } = require('../../../../controllers/climaController')
const router = express.Router();

module.exports = function () {
    router.get("/", (req, res)=> res.json({status: "ok public"}));
    router.get("/clima", climaController);
    return router;
};
