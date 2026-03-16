import client from "../loaders/redis.js";

export default class redisModel {
  static instance;
  static getInstance() {
    if (!redisModel.instance) {
      redisModel.instance = new redisModel();
    }
    return redisModel.instance;
  }

  get = async (key) => {
    const reply = await client.get(`${key}`);
    return reply;
  };

  keys = async (keys) => {
    const reply = await client.keys(keys);
    return reply;
  };

  set = async (keys, data) => {
    const reply = await client.set(keys, JSON.stringify(data));
    return reply;
  };

  rename = async (key, newKey) => {
    const reply = await client.rename(key, newKey);
    return reply;
  };

  del = async (key) => {
    const reply = await client.del(key);
    return reply;
  };
}
