const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.PAYMENT_SERECT_KEY);
const nodemailer = require("nodemailer");
const mg = require('nodemailer-mailgun-transport');
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

/* let transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: "apikey",
    pass: process.env.SENDGRID_API_KEY
  }
}) */

const auth = {
  auth: {
    api_key: process.env.EMAIL_API_KEY,
    domain: process.env.EMAIL_DOMAIN
  }
}

const transporter = nodemailer.createTransport(mg(auth));

// Send Payment Confirmation Email
const sendPaymentConfirmationEmail = (payment) => {
  transporter.sendMail({
    from: "mafizul1912@gmail.com", // verified sender email
    to: payment?.email, // recipient email
    subject: "Your Order Is Confirm", // Subject line
    text: "Bistro Boss Restaurant", // plain text body
    html: `
      <div>
        <h2>Payment Confirm</h2>
        <p>Your Transaction ID is ${payment?.transactionId}</>
        <p>Total Pay: ${payment?.price}</p>
      </div>
    `, // html body
  }, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}



const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: "Unauthorize Access" })
  }
  const token = authorization.split(' ')[1];
  // console.log(token);
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRECT, (error, decoded) => {
    if (error) {
      return res.status(401).send({ error: true, message: "Unzuthorize Access" })
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

    const userCollections = client.db('bistroBossDB').collection('users');
    const menuCollections = client.db('bistroBossDB').collection('menu');
    const reviewCollections = client.db('bistroBossDB').collection('reviews');
    const cartCollections = client.db('bistroBossDB').collection('carts');
    const paymentCollections = client.db('bistroBossDB').collection('payments');

    // JWT Setup 
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRECT, { expiresIn: '1h' })
      res.send({ token });
    })

    // Verify Admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollections.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'Forbidden Access' });
      }
      next();
    }

    // Admin Checking 
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await userCollections.findOne(query);
      const result = { admin: user?.role === 'admin' };
      // console.log(result);
      res.send(result);
    })

    // User Related API 
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result);
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: "User alredy exist" });
      }
      const result = await userCollections.insertOne(user);
      res.send(result);
    })

    // Make Admin 
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const userRole = req.body;
      // console.log(userRole.role);
      // console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateRole = {
        $set: {
          ...userRole
        }
      }
      const result = await userCollections.updateOne(filter, updateRole);
      res.send(result);
    })

    // Menu API 
    app.get('/menu', async (req, res) => {
      const result = await menuCollections.find().toArray();
      res.send(result);
    })

    app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollections.insertOne(item);
      res.send(result);
    })

    app.delete('/menu/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollections.deleteOne(query);
      res.send(result)
    })

    // Reviews Related API 
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollections.find().toArray();
      res.send(result);
    })

    // Cart related API 
    app.get('/carts', verifyJWT, async (req, res) => {
      const email = req.query.email;
      // console.log(req.decoded);
      // console.log(req.decoded.email)

      if (!email) {
        return res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: "Forbiden Access" });
      }

      const query = { email: email };
      const result = await cartCollections.find(query).toArray();
      res.send(result);
    })

    app.post('/carts', async (req, res) => {
      const item = req.body;
      // console.log(item);
      const result = await cartCollections.insertOne(item);
      // console.log(result);
      res.send(result);
    })

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await cartCollections.deleteOne(query);
      res.send(result);
    })

    // Payment Method
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      // console.log(price, amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card'],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })

    //Payment 
    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollections.insertOne(payment);
      const query = { _id: { $in: payment.cartItemId?.map(id => new ObjectId(id)) } };
      const deleteResult = await cartCollections.deleteMany(query);

      // Send Email
      sendPaymentConfirmationEmail(payment);

      res.send({ insertResult, deleteResult });
    })

    // Dashboard
    app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
      const products = await menuCollections.estimatedDocumentCount();
      const orders = await paymentCollections.estimatedDocumentCount();

      const users = await userCollections.find().toArray();
      const findCustomers = users?.filter(user => user.role === 'user');
      const customers = findCustomers?.length;

      const paymentReceive = await paymentCollections.find().toArray();
      const revenue = paymentReceive?.reduce((sum, item) => sum + item.price, 0);

      res.send({ products, orders, customers, revenue })
    })

    // TODO Incomplete data
    app.get('/order-stats', async (req, res) => {
      const pipeline = [
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItems',
            foreignField: '_id',
            as: 'menuItemsData'
          }
        },
        {
          $unwind: '$menuItemsData'
        },
        {
          $group: {
            _id: '$menuItemsData.category',
            count: { $sum: 1 },
            total: { $sum: '$menuItemsData.price' }
          }
        },
        {
          $project: {
            category: '$_id',
            count: 1,
            total: { $round: ['$total', 2] },
            _id: 0
          }
        }
      ];
      // console.log(pipeline);
      const result = await paymentCollections.aggregate(pipeline).toArray()
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
  res.send('Bistro Boss Server is Running');
});

app.listen(port, () => {
  console.log(`Bistro Boss Server Running Port: ${port}`);
})