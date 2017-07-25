const fs = require('fs');
const Joi = require('joi');

const schemaUser = Joi.object().keys({
    username: Joi.string().min(4).max(20).required(),
    password: Joi.string().alphanum().min(8).required(),
    email: Joi.string().email().required(),
    role: Joi.valid().allow(['superadmin', 'admin', 'user']).required()
}).with('username','password','email','role');

const schemaGroup = Joi.object().keys({
    name: Joi.string().min(4).required(),
    listOfUsers: Joi.array().items(Joi.number()).min(1).required()
}).with('name','listOfUsers');

const schemaPatchUser = Joi.object().keys({
    username: Joi.string().min(4).max(20),
    password: Joi.string().alphanum().min(8),
    email: Joi.string().email(),
    role: Joi.valid().allow(['superadmin', 'admin', 'user'])
})

const schemaPatchGroup = Joi.object().keys({
    name: Joi.string().min(4),
    listOfUsers: Joi.array().items(Joi.number()).min(1)
})

let read = (file) => {
    return new Promise((resolve,reject) => {
        fs.readFile(file, 'utf-8', (err,data) => {
            if(err){
                reject(err);
            }else{
                resolve(JSON.parse(data));
            }
        })
    })
}

let write = (file,data) => { //function for writing data into json files 
    return new Promise((resolve,reject) => {
        fs.writeFile(file, JSON.stringify(data), (err) => {
            if(err){
               reject(err);
            }else{
              resolve();
            }
        })
    })
}

let getUsers = (req,res) => {
    return read('users.json')
}

let getGroups = (req,res) => {
    return read('groups.json')
}

let validUserPost = (file,req,res,next) => {//handler for adding new user
    let valid = Joi.validate(req.body,schemaUser);
    let id = 1;
    if(valid.error){
        throw new Error(valid.error)
    }
    
    return read(file)
        .then((data) => {
            if(!data.length){
                req.body.role = 'superadmin'; //if list of users is empty, then 1-st user becomes superadmin
            }
            for(let element of data){
                id = +element.id;
                if(element.role == req.body.role && req.body.role == 'superadmin'){//can't be more then 2 superadmins
                    throw new Error("Can't set role 'superadmin'");
                }
                if(element.email == req.body.email){//must be unequal emails
                    id = 0;
                    throw new Error("Duplicate email");
                }
            };
            data.push({id:id+1,username:req.body.username,password:req.body.password,email:req.body.email,role:req.body.role});
            return write(file,data)
        })
        .then((data) => {
             return Promise.resolve(res.status(200).json({userId:id+1}))
        })
        .catch((e) => {throw new Error(e)}) 
}
let validGroupPost = (file,req,res,next) => {//handler for adding new group
    let valid = Joi.validate(req.body,schemaGroup);
    let id = 1;
    if(valid.error){
        throw new Error(valid.error)
    }

    return read(file)
        .then((data) => {
            for(let element of data){
                id = +element.id;
                if(element.name == req.body.name){//Checking group name 
                    id = 0;
                    throw new Error(`${req.body.name} group is already exists`)
                }
            };
            req.body.listOfUsers = JSON.parse(req.body.listOfUsers);
            data.push({id:id+1,name:req.body.name,listOfUsers:req.body.listOfUsers});
            return write(file,data)                    
        })
        .then((data) => {
             return Promise.resolve(res.status(200).json({groupId:id+1}))
        })
        .catch((e) => {throw new Error(e)})
}

let deleteUser = (req,res) => {//handler for user deleting
    let delUserName;
    let rewrite = false; 
    return read('users.json')
        .then((data) => {
            if (data.length == 0){
                throw new Error("User's list is empty")
            }
            let index = -1;
            data.forEach((element,i) => {
                if(element.id == req.params.userId) {
                    index = i;
                }
            });
            if(index == -1){
                throw new Error("User not found")
            }//deleting user's id from listOfUsers in group.json file
            if(data[index].role == 'superadmin'){// it is impossible to remove superadmin  
                throw new Error("This user couldn't be deleted")
            }
            delUserName = data.splice(index,1)[0].username;
            return write('users.json',data)
        })
        .then((data) =>{
           return read('groups.json')
        })
        .then((data) =>{
            for(let val of data){
                let possition = val.listOfUsers.indexOf(+req.params.userId);
                if(~possition){
                    rewrite = true;
                    val.listOfUsers.splice(possition,1);
                }
            }
            if(rewrite){
                return write('groups.json',data)
            }else{
                return Promise.resolve()
            }
        })
        .then((data) => {
            return Promise.resolve(res.status(200).json({operation:`User ${delUserName} was deleted successful`}))
        })
        .catch((e) => {throw new Error(e)})
}

let deleteGroup = (req,res) => {//handler for group deleting
    let delGroup;
    return read('groups.json')
        .then((data) => {
            let position = -1;    
            data.forEach((item,i) =>{
                if(item.id == req.params.groupId){
                    position = i;
                }
            })
            if(position == -1){
                throw new Error("Group not found")
            }else{
                delGroup = data.splice(position,1)[0].name;
                return write('groups.json',data)
            }
        })
        .then((data) => {
            return Promise.resolve(res.status(200).json({operation:`Group ${delGroup} was deleted successful`}))
        })
        .catch((e) => {
            throw new Error(e)                     
        })
};

let patchUser = (req,res) => { //handler for updata information about user
    let user;
    let valid = Joi.validate(req.body,schemaPatchUser);
    if(valid.error){
        throw new Error(valid.error)
    }
    return read('users.json')
        .then((data) => {
            let index = -1, count = 0, idSup;
            data.forEach((item,i) => {
                if(item.role == 'superadmin' && req.body.role != undefined ){
                    checkSuperadmin = true;//The fragment of code below checks a number of users whith role
                    idSup = item.id;//'superadmin' and if req.id equals userId with role 'superadmin' and it's 
                    count++;//only one user in list, we can't change its role
                }
                if(item.id == req.params.userId){                    
                    index = i;
                }
            });
            if(req.params.userId == idSup && count == 1){
                throw new Error("Can't change user's role")
            }
            if(~index){
                user = data[index].username;
                Object.assign(data[index],req.body);
                return write('users.json',data)
            }else{
                throw new Error("User not found");
            }
        })
        .then((data) => {
            return Promise.resolve(res.status(200).json({operation:`User ${user} was update successful`}))
        })
        .catch((e) =>{
            throw new Error(e)
        })        
}

let patchGroup = (req,res) => {//handler for updata information about group
    let group;
    let valid = Joi.validate(req.body,schemaPatchGroup);
    if(valid.error){
        throw new Error(valid.error)
    }

    return read('groups.json')
        .then((data) => {
            let index = -1;
             data.forEach((item,i) => {
                 if(req.params.groupId == item.id){                  
                    index = i;
                 }
            })
            if(~index){
                if(req.body.listOfUsers){
                    req.body.listOfUsers = JSON.parse(req.body.listOfUsers);
                }
                group = data[index].name;
                data[index].name = req.body.name || data[index].name;
                if(req.body.listOfUsers){
                    for(let val of req.body.listOfUsers){
                        let exist = true;
                        for(let val2 of data[index].listOfUsers){
                            if(val == val2){
                                exist = false
                                break;
                            }                            
                        }
                        if(exist){                            
                            data[index].listOfUsers.push(val)
                        }
                    }
                }
                return write('groups.json',data)
            }else{
                throw new Error('Group not found')
            }
        })
        .then((data) => {
            return Promise.resolve(res.status(200).json({operation:`Group ${group} was update successful`}))
        })
        .catch((e) => {
            throw new Error(e)
        })             
}

let findCb = (user,pass) => {
    return (el) => {
        return  el.username == user && el.password == pass
    }
}

exports.findCb = findCb;
exports.read = read;
exports.getUsers = getUsers;
exports.getGroups = getGroups;
exports.validUserPost = validUserPost;
exports.validGroupPost = validGroupPost;
exports.patchUser = patchUser;
exports.patchGroup = patchGroup;
exports.deleteUser = deleteUser;
exports.deleteGroup = deleteGroup;