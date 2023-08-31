const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
const uuid = require("uuid");
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// verifing jwt

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized access" });
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized access" });
    }

    req.decoded = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hbiibcp.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const usersCollection = client.db("contactsManagement").collection("users");

    // JWT token
    app.post("/jwt", (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res.send({ token });
    });

    // ========================== Getting All users ==========================
    app.get("/all-users", async (req, res) => {
      const options = {
        sort: { name: 1 },
        projection: { _id: 1, name: 1, email: 1 },
      };
      const result = await usersCollection.find({}, options).toArray();
      res.send(result);
    });

    // taking user's data when creating account
    app.post("/add-user", async (req, res) => {
      const { user } = req.body;

      const existing = await usersCollection.findOne({ email: user.email });
      if (existing) {
        return res.send({ message: "The user is already exist." });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    /* ====================================================
                    Own Contacts managements
     ==================================================== */

    // ========================== sending contacts to the client ==========================
    app.get("/contacts/:email", verifyJWT, async (req, res) => {
      const { email } = req.params;
      const query = { email: email };

      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // ========================== Getting individual contact ==========================
    app.get("/get-contact/:email/:contactId", verifyJWT, async (req, res) => {
      const { email, contactId } = req.params;

      const user = await usersCollection.findOne({ email: email });

      let result;

      if (user) {
        result = await user.contacts?.find(
          (contact) => contact._id == contactId
        );
      }

      res.send(result);
    });

    // ========================== Adding new contact that is comming from client ==========================
    app.patch("/add-contact/:email", verifyJWT, async (req, res) => {
      const email = req.params?.email;
      const { contact } = req.body;
      let query = {};

      if (req.params?.email) {
        query = { email: email };
      }

      contact._id = uuid.v4().slice(0, 12);

      const newContacts = {
        $push: { contacts: contact },
      };
      const result = await usersCollection.updateOne(query, newContacts);

      res.send(result);
    });

    // ========================== Deleting individual contact ==========================
    app.patch("/delete-contact", verifyJWT, async (req, res) => {
      const email = req.query?.email;
      const id = req.query?.id;

      const query = { email: email };

      const deleteItem = {
        $pull: { contacts: { _id: id } },
      };

      const result = await usersCollection.updateOne(query, deleteItem);
      res.send(result);
    });

    // ========================== Updating individual contact ==========================
    app.patch("/update-contact/:email", verifyJWT, async (req, res) => {
      const email = req.params?.email;
      const { contact } = req.body;

      const query = {
        email: email,
        "contacts._id": contact._id,
      };

      const updatedContact = {
        $set: { "contacts.$": contact },
      };

      const result = await usersCollection.updateOne(query, updatedContact);
      res.send(result);
    });

    // ========================== Setting shared contacts to the user's object ==========================
    app.patch("/share-contacts/:email", verifyJWT, async (req, res) => {
      const { email } = req.params;
      const { sharedContacts } = req.body;

      const updatePermittedContacts = {
        $push: { permittedContacts: { $each: sharedContacts } },
      };

      const result = await usersCollection.updateOne(
        { email: email },
        updatePermittedContacts
      );
      res.send(result);
    });

    // ========================== Setting shared info to individual contact ==========================
    app.patch(
      "/set-shared-info/:email/:contactId",
      verifyJWT,
      async (req, res) => {
        const { email, contactId } = req.params;
        const tag = req.body;

        const query = {
          email: email,
          "contacts._id": contactId,
        };

        const sharedInfo = {
          $push: { "contacts.$.tags": tag },
        };

        const result = await usersCollection.updateOne(query, sharedInfo);
        res.send(result);
      }
    );

    // ======================== Updating shared info with updated permission to individual contact ====================
    app.patch(
      "/updating-permissin-shared-info/:email/:contactId",
      verifyJWT,
      async (req, res) => {
        const { email, contactId } = req.params;
        const { info } = req.body;

        const query = {
          email: email,
          "contacts._id": contactId, // Match the contactId in the contacts array
          "contacts.tags._id": info._id,
        };

        const update = {
          $set: { "contacts.$.tags.$[tag].write": info.write },
        };

        const options = {
          arrayFilters: [{ "tag._id": info._id }],
        };

        const result = await usersCollection.updateOne(query, update, options);
        res.send(result);
      }
    );

    // ========================== Deleting shared info from individual contact ==========================
    app.patch(
      "/delete-shared-info/:email/:contactId",
      verifyJWT,
      async (req, res) => {
        const { email, contactId } = req.params;
        const tag = req.body;

        const query = {
          email: email,
          "contacts._id": contactId,
        };

        const deleteInfo = {
          $pull: { "contacts.$.tags": tag },
        };

        const result = await usersCollection.updateOne(query, deleteInfo);
        res.send(result);
      }
    );

    /* ====================================================
              Permitted contacts APIs
     ==================================================== */

    // ========================== To get individual permitted contact ==========================
    app.get(
      "/get-permitted-contact/:email/:contactId",
      verifyJWT,
      async (req, res) => {
        const { email, contactId } = req.params;

        const user = await usersCollection.findOne({ email: email });

        let result;

        if (user) {
          result = await user.permittedContacts?.find(
            (contact) => contact._id == contactId
          );
        }

        res.send(result);
      }
    );

    // ========================== Updating permitted individual contact ==========================
    app.patch(
      "/update-permitted-contact/:email",
      verifyJWT,
      async (req, res) => {
        const email = req.params?.email;
        const { contact } = req.body;

        const query = {
          email: email,
          "permittedContacts._id": contact._id,
        };

        const updatedContact = {
          $set: { "permittedContacts.$": contact },
        };

        const result = await usersCollection.updateOne(query, updatedContact);
        res.send(result);
      }
    );

    // ========================== Updating permission for permitted contact ==========================
    app.patch("/update-permission/:email", verifyJWT, async (req, res) => {
      const email = req.params?.email;
      const { contact } = req.body;

      const query = {
        email: email,
        "permittedContacts._id": contact._id,
      };

      const updatedContact = {
        $set: { "permittedContacts.$.write": contact.write },
      };

      const result = await usersCollection.updateOne(query, updatedContact);
      res.send(result);
    });

    // ========================== Deleting permitted individual contact ==========================
    app.patch("/delete-parmitted-contact", verifyJWT, async (req, res) => {
      const email = req.query?.email;
      const id = req.query?.id;

      const query = { email: email };

      const deleteItem = {
        $pull: { permittedContacts: { _id: id } },
      };

      const result = await usersCollection.updateOne(query, deleteItem);
      res.send(result);
    });

    /* ====================================================
              Notifications APIs
     ==================================================== */

    // ========================== Getting all notifications ==========================
    app.get("/all-notifications/:email", async (req, res) => {
      const { email } = req.params;

      const result = await usersCollection.findOne(
        { email: email },
        { projection: { notifications: 1, _id: 0 } }
      );

      res.send(result);
    });

    // sending notification to receiver
    app.patch(
      "/send-notification/:receiverEmail",
      verifyJWT,
      async (req, res) => {
        const { receiverEmail } = req.params;
        const newNotification = req.body;
        const result = await usersCollection.updateOne(
          { email: receiverEmail },
          { $push: { notifications: newNotification } }
        );
        res.send(result);
      }
    );

    // updating notification reading status after reading
    app.patch(
      "/update-notification-status/:email",
      verifyJWT,
      async (req, res) => {
        const { email } = req.params;
        const result = await usersCollection.updateMany(
          { email: email },
          { $set: { "notifications.$[elem].read": true } },
          { arrayFilters: [{ "elem.read": false }] }
        );
        res.send(result);
      }
    );

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("contacts management is running");
});

app.listen(port, () => {
  console.log(`contacts management is running on port ${port}`);
});

app.on("error", (error) => {
  console.error("Server error:", error);
});
