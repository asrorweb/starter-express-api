import Client from "../models/regular-client-model.js";
import ProductBaseModel from "../models/product-base-model.js";
import ProductTradeHistory from "../models/product-trade-history.js";
import SimpleClient from "../models/simple-client-model.js";

// Barcha trade history obyektlarini olish
export const getAllTradeHistory = async (req, res, next) => {
   try {
      // Sahifalash uchun kerakli parametrlarni olish
      const page = parseInt(req.query.page) || 1; // Hozirgi sahifa (agar query parametri berilmasa 1-sahifa)
      const limit = parseInt(req.query.limit) || 10; // Har bir sahifadagi elementlar soni (agar query parametri berilmasa 10 ta element)

      // Boshlang'ich vaqt limitini hisoblash
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;

      // Barcha trade history obyektlarini olish
      const tradeHistory = await ProductTradeHistory.find()
         .sort({ createdAt: "desc" })
         .populate([
            { path: "author", select: "-password -powers" }, // "select" bo'limini to'g'riladim
         ])
         .skip(startIndex) // Boshlanish indeksi
         .limit(limit); // Chegara

      // Keyingi sahifani tekshirish
      const total = await ProductTradeHistory.countDocuments();
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = endIndex < total;
      const hasPrevPage = startIndex > 0;

      // Pagination ma'lumotlarni o'z ichiga oluvchi obyekt
      const pagination = {
         totalPages,
         currentPage: page,
         hasNextPage,
         hasPrevPage,
         totalEntries: total,
         entriesPerPage: tradeHistory.length,
      };

      res.status(200).json({ tradeHistory, pagination });
   } catch (error) {
      next(error);
      // ish ErrorHandlerGlobal.js da davom etyapti
      // work in progress at ErrorHandlerGlobal.js
   }
};

export const getAllTradeHistoryWithoutPagination = async (req, res, next) => {
   try {
      const tradeHistory = await ProductTradeHistory.find();

      return res.status(200).json(tradeHistory);
   } catch (error) {}
};

export const sellProduct = async (req, res, next) => {
   try {
      const { saleBasket, summaFromClient, clientInformation, tradeSumm, isRegularClient } = req.body;
      console.log("req body", req.body);
      const workerId = req.user._id;

      if (saleBasket.length === 0)
         return res
            .status(404)
            .json({ message: "Сотиш учун махсулот киритлимаган", messageUz: "Sotish uchun maxsulot kiritlimagan" });

      if (isRegularClient) {
         const { name, number } = clientInformation;
         if (!name || !number)
            return res.status(404).json({
               message: "Клент малумотларини тўлиқ киритинг",
               messageUz: "Klent malumotlarini to'liq kiriting",
            });
      }

      // Savdo tarixini yaratish
      const tradeHistory = new ProductTradeHistory({
         author: workerId,
         client: clientInformation,
         summaFromClient,
         tradeSumm,
         tradeHistory: [],
      });

      // Maxsulotlarni sotish
      for (const saleItem of saleBasket) {
         const { name, saleMater, salePrice, saleSum, saleId, productId } = saleItem;

         const product = await ProductBaseModel.findOneAndUpdate(
            { _id: productId, "quantity._id": saleId },
            {
               $inc: { "quantity.$.meter": -saleMater },
            },
            { new: true }
         );

         if (product.quantity.some((qty) => qty.meter === 0)) {
            await ProductBaseModel.findOneAndUpdate(
               { _id: productId, "quantity._id": saleId },
               {
                  $pull: { quantity: { meter: 0 } },
               },
               { new: true }
            );
         }

         // Savdo tarixiga maxsulot qo'shish
         tradeHistory.tradeHistory.push({
            name,
            saleMater,
            salePrice,
            saleSum,
            saleId,
            productId,
         });
      }

      // Klientni topish va unga savdo tarixini qo'shish
      if (isRegularClient) {
         await Client.findOneAndUpdate(
            { number: clientInformation.number },
            {
               $push: { tradeHistory: tradeHistory._id },
               $inc: { totalBalance: summaFromClient - tradeSumm },
            },
            { new: true }
         );
      } else {
         // SimpleClient yaratish
         const simpleClient = new SimpleClient({
            name: clientInformation.name || "Мижоз",
            number: clientInformation.number || "+998",
         });

         // Trade history ni simpleClient ga qo'shish
         simpleClient.tradeHistory.push(tradeHistory._id);

         await simpleClient.save();
      }

      // Savdo tarixini saqlash
      await tradeHistory.save();

      res.status(201).json({ tradeHistory });
   } catch (error) {
      next(error);
      // ish ErrorHandlerGlobal.js da davom etyapti
      // work in progress at ErrorHandlerGlobal.js
   }
};

export const cancelSellProduct = async (req, res, next) => {
   try {
      const { id } = req.params; // Savdo tarixi identifikatori

      console.log(id);

      // Savdo tarixini bazadan o'chirish
      const deletedTradeHistory = await ProductTradeHistory.findByIdAndDelete(id);

      console.log("deleteHis cancel trade", deletedTradeHistory);

      const { client, summaFromClient, tradeSumm, tradeHistory } = deletedTradeHistory;

      // Savdo qilinadigan klientni topish
      const ClientUpdate = await Client.findOne({ number: client.number });
      console.log("CLient cancel trade", ClientUpdate);

      if (ClientUpdate) {
         // totalBalance ni yangilash
         ClientUpdate.totalBalance -= summaFromClient - tradeSumm;
         // Klientni yangilangan totalBalance bilan saqlash
         await ClientUpdate.save();
      }

      for (const saleItem of tradeHistory) {
         // Update product base model
         console.log("product id", saleItem.productId);
         const pr = await ProductBaseModel.findOneAndUpdate(
            { _id: saleItem.productId },
            { $push: { quantity: { meter: saleItem.saleMater } } },
            { new: true } // Yangi parametrlar: new va upsert
         );

         console.log("prod", pr);
      }

      res.status(200).json({ message: "Savdo bekor qilindi", messageUz: "Savdo bekor qilindi" });
   } catch (error) {
      next(error);
   }
};

// Trade history obyektini ID boyicha chaqirish
export const getTradeHistoryById = async (req, res, next) => {
   try {
      const { id } = req.params; // Trade history ID sini URL dan olish

      // Trade history obyektini ID boyicha chaqirish
      const tradeHistory = await ProductTradeHistory.findById(id);

      if (!tradeHistory) {
         return res.status(404).json({ message: "Савдо тарихи топилмади", messageUz: "Savdo tarixi topilmadi" });
      }

      res.status(200).json(tradeHistory);
   } catch (error) {
      next(error);
   }
};
