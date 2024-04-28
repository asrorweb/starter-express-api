import { Router } from "express";
import authorizationToken from "../middlewares/authorizationToken.js";
import {
   cancelSellProduct,
   getAllTradeHistory,
   getAllTradeHistoryWithoutPagination,
   getTradeHistoryById,
   sellProduct,
} from "../controllers/trade-controller.js";

const tradeRouter = Router();

tradeRouter.get("/all-history", authorizationToken, getAllTradeHistory);

tradeRouter.get("/all", authorizationToken, getAllTradeHistoryWithoutPagination);

tradeRouter.get("/history/:id", authorizationToken, getTradeHistoryById);

tradeRouter.post("/sell", authorizationToken, sellProduct);
tradeRouter.post("/cencel/:id", authorizationToken, cancelSellProduct);

export default tradeRouter;
