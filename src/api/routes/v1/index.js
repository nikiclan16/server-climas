import express from "express";
import publicRoutes from "./public/index.js";

const router = express.Router();

export default function () {
  router.get("/", (req, res) => res.json({ status: "v1" }));
  router.use("/public/", publicRoutes());
  return router;
}
