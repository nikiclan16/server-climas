const moment = require('moment')
const { secretKey } = require("../config")
const fs = require('fs')

removeAccentsAndSpaces = (str) =>{
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

verifyToken = (token) => {
  return jwt.verify(token, secretKey.key)
}

randomString = (length) => {
  const characters ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ' '
  const charactersLength = characters.length;
  for ( let i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

saveLog = (text) =>{
  //Se guarda el log de lo realizado
  fs.appendFile('log-clima-jano.txt', text, (error)=>{
    if(error){
        throw error
    }
})
}

module.exports = { removeAccentsAndSpaces, verifyToken, randomString, saveLog }