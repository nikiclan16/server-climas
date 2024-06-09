const fetch = require('node-fetch');
const axios = require('axios').default;

exports.request = async (url, myMethod, myData, contentType, Bearer = null) => {
    try {
        const myHeaders = new fetch.Headers();
        contentType === 'application/x-www-form-urlencoded' ?
        myHeaders.append('Content-Type', 'application/x-www-form-urlencoded') :
        myHeaders.append('Content-Type', 'application/json')

        Bearer != null ?
            myHeaders.append('Authorization', 'Bearer ' + Bearer) : null

        const resp = await fetch(`${url}`, { method: `${myMethod}`, headers: myHeaders, body: myData })
        const json = await resp.json();
        return json;
    }
    catch (err) {
        console.log("errr",err);
    }
};

exports.requestGet = async (url) => {
    try {
        const response = await axios.get(url, {
            auth: {
                username: process.env.WOO_PUBLIC,
                password: process.env.WOO_SECRET
            }
        })
        return response;
    }
    catch (err) {
        console.log("errr",err);
    }
};

exports.requestPut = async (url, status) => {
    const data = {
        status: status
    };
    try {
        const response = await axios.put(url, data, {
            auth: {
                username: process.env.WOO_PUBLIC,
                password: process.env.WOO_SECRET
            },
        })
        return response;
    }
    catch (err) {
        console.log("errr",err);
    }
};