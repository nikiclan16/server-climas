import moment from "moment";
import fs from "fs";

export const removeAccentsAndSpaces = (str) => {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
};

export const verifyToken = (token) => {
  return jwt.verify(token, secretKey.key);
};

export const randomString = (length) => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = " ";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

export const saveLog = (text) => {
  fs.appendFile("log-clima-jano.txt", text, (error) => {
    if (error) {
      throw error;
    }
  });
};
