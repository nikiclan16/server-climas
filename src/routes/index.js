import express from "express";
import apiRouter from "../api/routes/v1/index.js";

const router = express.Router();

export default function () {
  router.get("/", (req, res) => res.json({ status: "ok" }));
  router.use("/api/v1/", apiRouter());
  return router;
}
