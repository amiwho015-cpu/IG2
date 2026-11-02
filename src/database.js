
/**
 * File Name: database.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * MongoDB database system by Tanvir143
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

class Store {
  constructor(file, defaults, options = {}) {
    this.file = file;
    this.defaults = defaults;
    this.data = {};
    this._writeTimer = null;
    this.collection = options.collection || null;
    this._pending = Promise.resolve();
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) {
        this.data =
          JSON.parse(fs.readFileSync(this.file, "utf8")) || {};
      }
    } catch (error) {
      this.data = {};
      require("./logger").warn(
        "DATABASE",
        `Could not load ${path.basename(this.file)}: ${error.message}`
      );
    }
  }

  _schedule() {
    if (this._writeTimer) clearTimeout(this._writeTimer);

    this._writeTimer = setTimeout(() => {
      this._writeTimer = null;
      this.flush();
    }, 250);

    if (this._writeTimer.unref) this._writeTimer.unref();
  }

  async flush() {
    if (this.collection) {
      const snapshot = Object.entries(this.data)
        .filter(([key]) => key !== "_projectHeader")
        .map(([key, value]) => ({
          ...value,
          _id: String(key)
        }));

      this._pending = this._pending.then(async () => {
        if (!snapshot.length) return;

        const operations = snapshot.map(doc => ({
          replaceOne: {
            filter: { _id: doc._id },
            replacement: doc,
            upsert: true
          }
        }));

        await this.collection.bulkWrite(operations, {
          ordered: false
        });
      });

      try {
        await this._pending;
      } catch (error) {
        require("./logger").warn(
          "DATABASE",
          `MongoDB save failed: ${error.message}`
        );
      }

      return;
    }

    try {
      fs.mkdirSync(path.dirname(this.file), {
        recursive: true
      });

      const tmp = this.file + ".tmp";

      fs.writeFileSync(
        tmp,
        JSON.stringify(this.data, null, 2)
      );

      fs.renameSync(tmp, this.file);
    } catch (error) {
      require("./logger").warn(
        "DATABASE",
        `Could not save ${path.basename(this.file)}: ${error.message}`
      );
    }
  }

  get(id) {
    return this.data[id] || null;
  }

  set(id, patch) {
    const current = this.data[id] ||
      JSON.parse(JSON.stringify(this.defaults));

    const next = Object.assign({}, current, patch);
    this.data[id] = next;
    this._schedule();

    return next;
  }

  ensure(id, patch = {}) {
    if (!this.data[id]) {
      this.data[id] = Object.assign(
        JSON.parse(JSON.stringify(this.defaults)),
        patch
      );
      this._schedule();
    }

    return this.data[id];
  }

  update(id, patch) {
    const current = this.data[id];
    if (!current) return null;

    Object.assign(current, patch);
    this._schedule();

    return current;
  }

  all() {
    return Object.entries(this.data)
      .filter(([key]) => key !== "_projectHeader")
      .map(([, value]) => value);
  }

  // Synchronous count for existing code using this Store.
  count() {
    return Object.keys(this.data)
      .filter(key => key !== "_projectHeader")
      .length;
  }

  // Live count directly from MongoDB when connected.
  async countDocuments() {
    if (this.collection) {
      return this.collection.countDocuments({});
    }

    return this.count();
  }

  async migrateJsonToMongo() {
    if (!this.collection) return false;

    if (await this.collection.countDocuments() > 0) {
      return false;
    }

    const docs = Object.entries(this.data)
      .filter(([key]) => key !== "_projectHeader")
      .map(([key, value]) => ({
        ...value,
        _id: String(key)
      }));

    if (docs.length) {
      await this.collection.insertMany(docs, {
        ordered: false
      });

      require("./logger").info(
        "DATABASE",
        `Migrated ${docs.length} records from ${path.basename(this.file)} to MongoDB.`
      );
    }

    return docs.length > 0;
  }

  async loadFromMongo() {
    if (!this.collection) return;

    const docs = await this.collection.find({}).toArray();
    this.data = {};

    for (const doc of docs) {
      const { _id, ...value } = doc;
      this.data[String(_id)] = value;
    }
  }
}

function createDatabase(config) {
  const databaseConfig = config.database || {};

  const dir = path.join(
    path.resolve(__dirname, ".."),
    databaseConfig.dir || "data"
  );

  fs.mkdirSync(dir, { recursive: true });

  const users = new Store(
    path.join(dir, "users.json"),
    {
      userID: null,
      name: null,
      username: null,
      firstSeen: Date.now(),
      banned: {
        status: false,
        reason: null,
        date: null
      },
      settings: {},
      data: {}
    }
  );

  const threads = new Store(
    path.join(dir, "threads.json"),
    {
      threadID: null,
      name: null,
      isGroup: false,
      groupKnown: false,
      members: [],
      adminIDs: [],
      settings: {},
      data: {}
    }
  );

  let client = null;

  const mongoUri =
    process.env.MONGODB_URI ||
    databaseConfig.uri ||
    "";

  const provider = (
    process.env.DATABASE_PROVIDER ||
    databaseConfig.provider ||
    ""
  ).toLowerCase();

  const useMongo =
    provider === "mongodb" || Boolean(mongoUri);

  let ready = Promise.resolve();

  if (useMongo) {
    if (!mongoUri) {
      ready = Promise.reject(
        new Error(
          "MongoDB is enabled, but MONGODB_URI is missing."
        )
      );
    } else {
      client = new MongoClient(mongoUri, {
        serverSelectionTimeoutMS: 15000
      });

      ready = (async () => {
        await client.connect();

        const db = client.db(
          databaseConfig.name || "igbot"
        );

        users.collection = db.collection("users");
        threads.collection = db.collection("threads");

        await users.migrateJsonToMongo();
        await threads.migrateJsonToMongo();

        await users.loadFromMongo();
        await threads.loadFromMongo();

        require("./logger").info(
          "DATABASE",
          ` Tanvir143 Connected to MongoDB "${db.databaseName}".`
        );
      })();
    }
  }

  return {
    dir,
    users,
    threads,
    provider: useMongo ? "mongodb" : "json",
    ready,

    async flush() {
      await Promise.all([
        users.flush(),
        threads.flush()
      ]);
    },

    async close() {
      await this.flush();

      if (client) {
        await client.close();
      }
    }
  };
}

module.exports = {
  Store,
  createDatabase
};
