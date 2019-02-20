var    express = require("express"),
        bodyParser = require("body-parser"),
      mongoose = require("mongoose"),
      methodOverride = require("method-override"),
      expressSanitizer = require("express-sanitizer"),
       passport = require("passport"),
       LocalStrategy = require("passport-local"),
       Comment = require("./models/comment"),
       flash = require("connect-flash"),
       nodemailer = require("nodemailer"),
       async = require("async"),
       crypto = require("crypto"),
       User = require("./models/user");
       var multer = require('multer');
var storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
var imageFilter = function (req, file, cb) {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};
var upload = multer({ storage: storage, fileFilter: imageFilter})

var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: 'dsk6699', 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

var app = express();
//APP CONFIG       

//mongoose.connect('mongodb://localhost:27017/blog_app', { useNewUrlParser : true});
mongoose.connect(process.env.DATABASEURL,{ useNewUrlParser : true });
app.set("view engine","ejs");
app.use(express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(expressSanitizer());
app.use(methodOverride("_method"));
//require moment
app.locals.moment = require('moment');
app.use(flash());
//mongoose model config
var blogSchema = new mongoose.Schema({
    title: String,
    image: String,
    body: String,
    hits:{type:Number,default:0},
    author:{
      id:{
          type:mongoose.Schema.Types.ObjectId,
          ref: "User"
      },
      username:String
    },
     comments: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref:"Comment"
        }
        ],
    created: {type: Date, default: Date.now}
});
var Blog = mongoose.model("Blog",blogSchema);
//Count.create();
//Passport config
app.use(require("express-session")({
    secret:"Heansika",
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
app.use(function(req,res,next){
    res.locals.currentUser = req.user;
    next();
});
app.use(function(req,res,next){
    res.locals.currentUser = req.user;
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    next();
});
//Restful ROUTES
app.get("/",function(req, res) {
    res.redirect("/blogs");
});
app.get("/blogs",function(req, res) {
    res.redirect("/blogs/recent");
});
app.get("/blogs/recent",function(req,res){
    var noMatch = null;
    if(req.query.search)
    {
        const regex = new RegExp(escapeRegex(req.query.search), 'gi');
      Blog.find({title: regex},function(err,blogs){
        if(err)
        {
            console.log(err);
        }
        else
        {   if(blogs.length < 1) {
                  noMatch = "No blogs match that query, please try again.";
                }
            res.render("index",{blogs:blogs, noMatch: noMatch});
        }
    }).sort({ created: 'desc' });  
    }
    else{
    Blog.find({},function(err,blogs){
        if(err)
        {
            console.log("Error");
        }
        else
        {
               
            res.render("index",{blogs:blogs,noMatch: noMatch});
               }
    }).sort({ created: 'desc' });
}
});
app.get("/blogs/popular",function(req,res){
    var noMatch = null;
    if(req.query.search)
    {
        const regex = new RegExp(escapeRegex(req.query.search), 'gi');
      Blog.find({title: regex},function(err,blogs){
        if(err)
        {
            console.log(err);
        }
        else
        {   if(blogs.length < 1) {
                  noMatch = "No blogs match that query, please try again.";
                }
            res.render("popular",{blogs:blogs, noMatch: noMatch});
        }
    });  
    }
    else{
    Blog.find({},function(err,blogs){
        if(err)
        {
            console.log("Error");
        }
        else
        {
               
            res.render("popular",{blogs:blogs,noMatch: noMatch});
               }
    }).sort({ hits : '-1' });
}
});

//NEW ROUTE
app.get("/blogs/new",isLoggedIn,function(req, res) {
   res.render("new"); 
});
//CREATE ROUTE
app.post("/blogs",isLoggedIn,upload.single('image'),function(req,res){
cloudinary.uploader.upload(req.file.path, function(result) {
  // add cloudinary url for the image to the campground object under image property
  req.body.blog.image = result.secure_url;
  // add author to campground
  req.body.blog.author = {
    id: req.user._id,
    username: req.user.username
  }
  Blog.create(req.body.blog, function(err, blog) {
    if (err) {
      req.flash('error', err.message);
      return res.redirect('back');
    }else{
    res.redirect('/blogs/' + blog.id);
           
    }
    
  });
});
});

//SHOW
app.get("/blogs/:id",function(req, res) {
   Blog.findByIdAndUpdate(req.params.id,{ $inc: { hits: 1 } }, {new: true }).populate("comments").exec(function(err, foundBlog){
       if(err || !foundBlog){
           req.flash("error","Blog not found!");
           res.redirect("/blogs/recent");
           console.log(err);
       }
       else
       {  console.log(foundBlog.hits);
           res.render("show",{blog: foundBlog});
       }
   }); 
});
//EDIT ROUTE
app.get("/blogs/:id/edit",checkCampgroundOwnership, function(req, res) {
    Blog.findById(req.params.id, function(err, foundBlog){
        if(err || !foundBlog)
        {req.flash("error","Blog not found!");
            res.redirect("/blogs/recent");
            
        }
        else
        {
            res.render("edit",{blog:foundBlog});        
        }
    });
    
    
});

//UPDATE ROUTE
app.put("/blogs/:id",checkCampgroundOwnership,function(req,res){
    req.body.blog.body = req.sanitize(req.body.blog.body);
    Blog.findByIdAndUpdate(req.params.id,req.body.blog, function(err,updatedBlog){
        if(err)
        {
            res.redirect("/blogs");
        }
        else{
            req.flash("success","Blog edited");
            res.redirect("/blogs/" + req.params.id);
        }
    });
});

//DELETE ROUTE
app.delete("/blogs/:id",checkCampgroundOwnership,function(req,res){
   Blog.findByIdAndRemove(req.params.id,function(err){
       if(err)
       {
           res.redirect("/blogs");
       }
       else
       {
           req.flash("success","Blog deleted");
           res.redirect("/blogs/recent");
       }
   }); 
});
//Comment Routes
app.get("/blogs/:id/comments/new",isLoggedIn,function(req, res) {
   Blog.findById(req.params.id,function(err,blog){
      if(err)
      {
          console.log(err);
      }
      else{
            res.render("comments/new",{blog: blog});        
      }
   });
    
});
app.post("/blogs/:id/comments",isLoggedIn,function(req,res){
    //lookup campground using ID
    Blog.findById(req.params.id,function(err, blog) {
       if(err)
       {
           //console.log(err);
           res.redirect("/blogs");
       }
       else
       {
           Comment.create(req.body.comment,function(err,newcomment){
               if(err)
               {
                   console.log(err);
               }
               else
               {newcomment.author.id = req.user._id;
                newcomment.author.username = req.user.username;
                newcomment.save();
                   blog.comments.push(newcomment);
                   blog.save();
                   req.flash("success","Commented Added");
                   res.redirect("/blogs/" + blog._id);
               }
           });
       }
    });
    //create new comment
    ///connect new comment to campgound
    //redirect campground to show page
    
});

app.get("/blogs/:id/comments/:comment_id/edit" ,checkCommentOwnership ,function(req,res){
    Blog.findById(req.params.id,function(err,foundBlog){
        if(err || !foundBlog)
        {
            req.flash("error","Blog Not Found");
            res.redirect("back");
        }
    Comment.findById(req.params.comment_id, function(err, foundComment) {
        if(err || !foundComment)
        {   req.flash("error","Comment Not Found");
            res.redirect("back");
        }
        else
        {
            res.render("comments/edit",{blog_id:req.params.id,comment: foundComment});
        }
    });
});
});

app.put("/blogs/:id/comments/:comment_id",checkCommentOwnership,function(req,res){
    Comment.findByIdAndUpdate(req.params.comment_id,req.body.comment,function(err,updatedComment){
        if(err)
        {
            res.redirect("back");
        }
        else{
            req.flash("success","Commented edited");
            res.redirect("/blogs/" + req.params.id);
        }
    })
});

app.delete("/blogs/:id/comments/:comment_id", checkCommentOwnership ,function(req,res){
   
   Comment.findByIdAndRemove(req.params.comment_id,function(err){
       if(err)
         {
             res.redirect("back");
             
         }
         else{
            req.flash("success","Comment deleted");
             res.redirect("/blogs/" + req.params.id);
         }
   }) ;
});



//AUTH ROUTES
//SHOW REGISTER
app.get("/register",function(req, res) {
    res.render("register");
});
//handle sign up
app.post("/register",upload.single('avatar'),function(req,res){
    cloudinary.v2.uploader.upload(req.file.path, function(err,result) {
        if(err){console.log(err);}
  // add cloudinary url for the image to the campground object under image property
  req.body.avatar = result.secure_url;
     var newUser = new User({username: req.body.username,avatar:req.body.avatar,email: req.body.email,lastName: req.body.lastName,firstName: req.body.firstName,about: req.body.about});
    if(req.body.adminCode === 'himalayan21') {
      newUser.isAdmin = true;
}
    User.register(newUser,req.body.password,function(err,user){
        if(err){
            console.log(err);
            return res.render("register", {error: err.message});
        }
        passport.authenticate("local")(req,res,function(){
            req.flash("success","Welcome " + user.username);
            res.redirect("/blogs/recent");
        });
    });

});
         if(req.body['g-recaptcha-response'] === undefined || req.body['g-recaptcha-response'] === '' || req.body['g-recaptcha-response'] === null) {
    return res.json({"responseCode" : 1,"responseDesc" : "Please select captcha"});
  }
  // Put your secret key here.
  var secretKey = "6LdKrY0UAAAAAL8DeK8IiBRxxSiHQj0nQBYz2Wk7";
  // req.connection.remoteAddress will provide IP address of connected user.
  var verificationUrl = "https://www.google.com/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + req.body['g-recaptcha-response'] + "&remoteip=" + req.connection.remoteAddress;
  // Hitting GET request to the URL, Google will respond with success or error scenario.
  request(verificationUrl,function(error,response,body) {
    body = JSON.parse(body);
    // Success will be true or false depending upon captcha validation.
    if(body.success !== undefined && !body.success) {
      return res.json({"responseCode" : 1,"responseDesc" : "Failed captcha verification"});
    }
    res.json({"responseCode" : 0,"responseDesc" : "Sucess"});
  });
});

//show login
var u;
app.get("/login",function(req, res) {
    
   res.render("login"); 
   
});
app.post("/login", passport.authenticate("local",{
    successRedirect: "/blogs/recent",
    failureRedirect: "/login",
    failureFlash: 'Invalid username or password.',
     successFlash: 'Welcome!'
}),function(req, res) {
     if(req.body['g-recaptcha-response'] === undefined || req.body['g-recaptcha-response'] === '' || req.body['g-recaptcha-response'] === null) {
    return res.json({"responseCode" : 1,"responseDesc" : "Please select captcha"});
  }
  // Put your secret key here.
  var secretKey = "6LdKrY0UAAAAAL8DeK8IiBRxxSiHQj0nQBYz2Wk7";
  // req.connection.remoteAddress will provide IP address of connected user.
  var verificationUrl = "https://www.google.com/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + req.body['g-recaptcha-response'] + "&remoteip=" + req.connection.remoteAddress;
  // Hitting GET request to the URL, Google will respond with success or error scenario.
  request(verificationUrl,function(error,response,body) {
    body = JSON.parse(body);
    // Success will be true or false depending upon captcha validation.
    if(body.success !== undefined && !body.success) {
      return res.json({"responseCode" : 1,"responseDesc" : "Failed captcha verification"});
    }
    res.json({"responseCode" : 0,"responseDesc" : "Sucess"});
  });
});
//logout
app.get("/logout",function(req, res) {
   req.logout();
   req.flash("success","logged you out!");
   res.redirect("/blogs/recent");
});


// forgot password
app.get('/forgot', function(req, res) {
  res.render('forgot');
});

app.post('/forgot', function(req, res, next) {
  async.waterfall([
    function(done) {
      crypto.randomBytes(20, function(err, buf) {
        var token = buf.toString('hex');
        done(err, token);
      });
    },
    function(token, done) {
      User.findOne({ email: req.body.email }, function(err, user) {
        if (!user) {
          req.flash('error', 'No account with that email address exists.');
          return res.redirect('/forgot');
        }

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

        user.save(function(err) {
          done(err, token, user);
        });
      });
    },
    function(token, user, done) {
      var smtpTransport = nodemailer.createTransport({
        service: 'Gmail', 
        auth: {
          user: 'sskdskblog@gmail.com',
          pass:  process.env.GMAILPW
        }
      });
      var mailOptions = {
        to: user.email,
        from: 'sskdskblog@gmail.com',
        subject: 'Blog Site Password Reset',
        text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
          'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
          'http://' + req.headers.host + '/reset/' + token + '\n\n' +
          'If you did not request this, please ignore this email and your password will remain unchanged.\n'
      };
      smtpTransport.sendMail(mailOptions, function(err) {
        console.log('mail sent');
        req.flash('success', 'An e-mail has been sent to ' + user.email + ' with further instructions.');
        done(err, 'done');
      });
    }
  ], function(err) {
    if (err) return next(err);
    res.redirect('/forgot');
  });
});

app.get('/reset/:token', function(req, res) {
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
    if (!user) {
      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.redirect('/forgot');
    }
    res.render('reset', {token: req.params.token});
  });
});
app.post('/reset/:token', function(req, res) {
  async.waterfall([
    function(done) {
      User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
        if (!user) {
          req.flash('error', 'Password reset token is invalid or has expired.');
          return res.redirect('back');
        }
        if(req.body.password === req.body.confirm) {
          user.setPassword(req.body.password, function(err) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;

            user.save(function(err) {
              req.logIn(user, function(err) {
                done(err, user);
              });
            });
          })
        } else {
            req.flash("error", "Passwords do not match.");
            return res.redirect('back');
        }
      });
    },
    function(user, done) {
      var smtpTransport = nodemailer.createTransport({
        service: 'Gmail', 
        auth: {
          user: 'sskdskblog@gmail.com',
          pass: process.env.GMAILPW
        }
      });
      var mailOptions = {
        to: user.email,
        from: 'sskdskblog@gmail.com',
        subject: 'Your password has been changed',
        text: 'Hello,\n\n' +
          'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
      };
      smtpTransport.sendMail(mailOptions, function(err) {
        req.flash('success', 'Success! Your password has been changed.');
        done(err);
      });
    }
  ], function(err) {
    res.redirect('/blogs');
  });
});

// USER PROFILE
app.get("/users/:id", function(req, res) {
  User.findById(req.params.id, function(err, foundUser) {
    if(err) {
      req.flash("error", "Something went wrong.");
      return res.redirect("/");
    }
    Blog.find().where('author.id').equals(foundUser._id).exec(function(err, blogs) {
      if(err) {
        req.flash("error", "Something went wrong.");
        return res.redirect("/");
      }
      res.render("users/users", {user: foundUser, blogs: blogs});
    })
  });
});

function isLoggedIn(req,res,next){
    if(req.isAuthenticated()){
        return next();
    }
    req.flash("error","Please Login!")
    res.redirect("/login");
}
function checkCampgroundOwnership(req,res,next)
{
    if(req.isAuthenticated()){
        Blog.findById(req.params.id,function(err, foundBlog) {
            if(err || !foundBlog)
            {
                req.flash("error","Blog not found");
                res.redirect("back");     
            }
            else{
                if(foundBlog.author.id.equals(req.user._id) || req.user.isAdmin){
                    next();}
                    else{
                        req.flash("error","You don't have permission!");
                        res.redirect("back");
                    }
                }
            
        });
        
    }
    else{
        req.flash("error","You need to be Logged in!");
        res.redirect("/login");
    }
}
 
function checkCommentOwnership(req,res,next)
{
    if(req.isAuthenticated()){
        Comment.findById(req.params.comment_id,function(err, foundComment) {
            if(err || !foundComment)
            {   req.flash("error","Comment not found")
                res.redirect("back");     
            }
            else{
                if(foundComment.author.id.equals(req.user._id) || req.user.isAdmin){
                    next();}
                    else{
                        req.flash("error","You dont'have permission");
                        res.redirect("back");
                    }
                }
            
        });
        
    }
    else{
        req.flash("error","You need to be Logged in!");
        res.redirect("back");
    }
}
function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};
app.use("*",function(req,res) {
  res.status(404).send("404");
})
app.listen(process.env.PORT,process.env.IP, function(){
    console.log("Blog app is running");
});
      