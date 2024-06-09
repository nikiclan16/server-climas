const express = require("express");
const apiRouter = require('../api/routes/v1/')
const router = express.Router();

module.exports = function () {
    router.get("/", (req, res)=> res.json({status: "ok"}));
    router.use("/api/v1/",  apiRouter());
    return router;
};
