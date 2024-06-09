const express = require("express");
const publicRoutes = require("./public");
const router = express.Router();

module.exports = function () {
    router.get("/",  (req, res) => res.json({status: "v1"}));
    router.use("/public/", publicRoutes());
    return router;
};