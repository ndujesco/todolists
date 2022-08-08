require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const _  = require("lodash")
const session = require('express-session')
const passport = require("passport")
const passportLocalMongoose = require("passport-local-mongoose")
const {flash} = require("express-flash-message");
const mongoose = require('mongoose');
const { update } = require("lodash");

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"))
app.set('view engine', 'ejs');
app.use(session({
  secret: process.env.SECRET_KEY,
  resave: false,
  saveUninitialized: false
}));
app.use(flash({sessionKeyName: "flashMessage"}));
app.use(passport.initialize());
app.use(passport.session())


async function main() {
  await mongoose.connect(`mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@cluster0.83uvt.mongodb.net/todolistDB?retryWrites=true&w=majority`);
}
main().catch(err => console.log(err));



const itemsSchema = new mongoose.Schema({
  name: String
});
const listSchema = {
  name: String,
  items: [itemsSchema]
}
const userSchema = new mongoose.Schema({
  name: String,
  lists: [listSchema]
});


userSchema.plugin(passportLocalMongoose)
const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());



const List = mongoose.model("List", listSchema);
const Item = mongoose.model("Item", itemsSchema);


app.get("/logout", (req, res)=>{
  req.logout((err)=>{
  })
  res.redirect("/login")
});


app.get("/",(req, res)=> {
  const loggedIn = req.isAuthenticated()
  if (loggedIn){
    User.findOne({username: req.user.username}, async (err, foundUser) => {
      const name = foundUser.name;
      const todayList = foundUser.lists.find(list => list.name === "Today")
      let messages = []
      if (req.query.delToday){
        await req.flash("info", "You can't delete")
        messages = await req.consumeFlash('info')
      }
    res.render("list", {title: "Today", items: todayList.items, lists: foundUser.lists, messages, name, loggedIn});
    });
  } else {
    res.render("list", {title: "Today", items: [], lists:[], messages: [], name:"", loggedIn});
  }

});

app.post("/new", (req, res)=>{
  if (req.isAuthenticated){
    const listToAdd = req.body.newList;
    res.redirect("/new/" + listToAdd)
  }else{
    redirect("/login")
  }

})


app.get("/new/:anything", (req, res) => {
  const loggedIn = req.isAuthenticated()
  if (loggedIn){
    const customListName = _.capitalize(req.params.anything);
    User.findOne({username: req.user.username}, async (err, foundUser) =>{
      const name = foundUser.name
      const foundList = foundUser.lists.find(list => list.name === customListName)
      if(foundList){
        res.render("list",  {title: foundList.name, items: foundList.items, lists: foundUser.lists, messages:[], name, loggedIn})

      }else{
        const list = new List({
          name: customListName,
          items: []
        });
        foundUser.lists.push(list)
        await foundUser.save()
        res.redirect("/new/" + customListName)
      }
    })
  }else{
    res.redirect("/login")
  }

});





app.post("/", function(req, res){
  const newTask = req.body.newTask;
  const listName = req.body.button;

  const newItem = new Item({
    name: newTask
  });
  if (req.isAuthenticated()){
    User.findOne({username: req.user.username}, (err, foundUser) =>{
      const foundList = foundUser.lists.find(list => list.name === listName)
      foundList.items.push(newItem)
      foundUser.save();
    })
    if (listName === "Today"){
      res.redirect("/")
    } else{
      res.redirect("/new/" + listName);
    }
  }else{
    res.redirect("/login")
  }

});


app.post("/deleteItem", (req, res)=> {
  if (req.isAuthenticated()){
    const checkedId = req.body.checkbox;
    const listName = req.body.listName;
    const query = {username: req.user.username};
    const update = {$pull: {"lists.$[list].items": {_id: checkedId}}};
    const options = {arrayFilters: [{"list.name": listName}]};
    User.findOneAndUpdate(query, update, options, (err, foundUser)=>{});
    if (listName === "Today"){
      res.redirect("/")
    } else{
      res.redirect("/new/" + listName);
    }
  }else{
    res.redirect("login")
  }
})

app.post("/deleteList", (req, res)=>{ 
  if (req.isAuthenticated()){
    const checkedId = req.body.delIcon;
    const listName = req.body.listName;
    const query = {username: req.user.username}
    const update = {$pull :{lists: {_id: checkedId}}}

    if (listName === "Today"){
      res.redirect("/?delToday=true")
    }else{
      User.findOneAndUpdate(query, update, (err, foundUser)=>{
      });
      res.redirect("/");
    }
  } else{
    res.redirect("login")
  }

})


app.route("/register")
    .get( (req, res)=>{
        res.render("register")
    })
    .post((req, res)=>{
        User.register({username: req.body.username}, req.body.password,  (err, user)=>{
            if(err){
                console.log(err);
                res.redirect("/login?err=" + err)
            }else {
              const name = _.capitalize(req.body.name);
              passport.authenticate("local")(req, res, ()=>{
                newList = new List({
                  name : "Today",
                  items: []
                });
                User.findOne({username: req.user.username}, (err, foundUser)=>{
                  if(!err){
                    foundUser.name = name
                    foundUser.lists = [newList]
                    foundUser.save()
                    res.redirect("/")
                  }
                })   
              })
            }
        })
    })


app.route("/login")
  .get(async (req, res)=>{
      if(req.query.err){
        if(req.query.err.split(":")[0] === "UserExistsError"){
            await req.flash('info', 'The email exists, please login instead');    
        }
      }else if(req.query.fromlog){
          await req.flash('info', "The email or password is incorrect. Enter the correct details or register");    
      }
      const messages = await req.consumeFlash('info')
      res.render("login", {messages:messages});
    })
    .post((req, res)=>{
      passport.authenticate("local", { failureRedirect: '/login?fromlog=true'})(req, res, ()=>{
              res.redirect("/")
      })  
        
    });



let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}
app.listen(port);
