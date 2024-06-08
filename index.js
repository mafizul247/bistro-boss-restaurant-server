const express = require('express');
const cors = require('cors');
const app = express();
const dotenv = require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Unauthorization Access' })
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res.status(401).send({ error: true, message: 'Unauthorization Access' })
    }
    req.decoded = decoded;
    next();
  })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.k95s6zq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollections = client.db('bistroBoss').collection('users');
    const menuCollections = client.db('bistroBoss').collection('menu');
    const reviewCollections = client.db('bistroBoss').collection('reviews');
    const cartCollections = client.db('bistroBoss').collection('carts');

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

    app.get('/users', async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result);
    })

    app.post('/user', async (req, res) => {
      const user = req.body;
      user.entryDate = new Date();
      const query = { email: user.email };
      const existingUser = await userCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User alreday exists' })
      }
      const result = await userCollections.insertOne(user);
      res.send(result);
      // console.log(result);
    })

    app.patch('/user/admin/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateUser = {
        $set: {
          role: 'admin',
          updteDate: new Date()
        }
      }
      const result = await userCollections.updateOne(query, updateUser);
      res.send(result);
    })

    app.get('/menu', async (req, res) => {
      const result = await menuCollections.find().toArray();
      res.send(result);
    })

    app.get('/reviews', async (req, res) => {
      const result = await reviewCollections.find().toArray();
      res.send(result);
    })

    app.get('/carts', verifyJWT, async (req, res) => {
      const email = req.query.email;
      // console.log(email);
      // const query = {email: email}
      if (!email) {
        return res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'Forbidden Access' })
      }

      const result = await cartCollections.find({ email: email }).sort({ entryDate: -1 }).toArray();
      res.send(result);
    })

    app.post('/carts', async (req, res) => {
      const item = req.body;
      const entryDate = new Date();
      item.entryDate = entryDate;
      const result = await cartCollections.insertOne(item);
      res.send(result);
    })

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollections.deleteOne(query);
      res.send(result);
      // console.log(result);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Bistro Boss Restaurant Server is Running');
})

app.listen(port, () => {
  console.log(`Bistro Boss Restaurant Server is Running Port: ${port}`);
})