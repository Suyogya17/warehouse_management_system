const bcrypt = require("bcryptjs");

console.log(bcrypt.hashSync("admin@123", 10));