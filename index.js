const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");
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

    // ========================== sending contacts to the client ==========================
    app.get("/contacts/:email", async (req, res) => {
      // const email = req.query?.email;
      const { email } = req.params;
      const query = { email: email };

      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // ========================== Adding new contact that is comming from client ==========================
    app.patch("/add-contact/:email", async (req, res) => {
      const email = req.params?.email;
      const { contact } = req.body;
      let query = {};

      if (req.params?.email) {
        query = { email: email };
      }

      const user = await usersCollection.findOne(query);
      const contacts = user?.contacts;

      const newContacts = {
        $set: { contacts: [...contacts, contact] },
      };

      const result = await usersCollection.updateOne(query, newContacts);

      res.send(result);
    });

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
