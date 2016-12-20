'use strict'

const botbuilder = require('botbuilder');
const restify = require('restify');
const oxford = require('project-oxford');

let OC = new oxford.Client(process.env.PROJECT_OXFORD_KEY);

var app = restify.createServer();

var connector = new botbuilder.ChatConnector();

var bot = new botbuilder.UniversalBot(connector);

app.post('/api/messages', connector.listen());

app.listen(3978, function () {
    console.log('server is running.');
});

const MODEL = "https://api.projectoxford.ai/luis/v2.0/apps/fdbbba5c-d780-4037-ba48-65912466b71e?subscription-key=f69f3ef0bd804033b57fdd7f0e0254ba&verbose=true";
const PERSON_GROUP_ID = "users";

var recognizer = new botbuilder.LuisRecognizer(MODEL);

var dialog = new botbuilder.IntentDialog({ recognizers: [recognizer]});

bot.dialog('/', dialog);

dialog.matches('register', [
    function (session, args, next) {
        /**
        if (session.userData.personId) {
            session.send('No need to register you');
            return;
        }**/

        botbuilder.Prompts.text(session, 'What is your name?');
    },
    function (session, results, next) {
        let name = results.response;
        session.userData.name = name;

        botbuilder.Prompts.attachment(session, "Great! Now upload a picture of yourself for me :)");
    },
    function (session, results) {
        let address = session.message.address;
        let weChatId = session.message.user.id;

        let attachmentUrl = getPhotoAttachment(session);

        session.send('Thanks ~ going to register you now.');

        OC.face.person.create(
            PERSON_GROUP_ID,
            session.userData.name,
            weChatId
        ).then(function (response) {
            if (!response.personId) {    
                throw "Could not create a person!";
            }

            console.log('Added person!');
            let personId = response.personId;

            return OC.face.person.addFace(
                PERSON_GROUP_ID,
                personId,
                {
                    url: attachmentUrl,
                }
            );
        }).then(function (response) {
            if (!response.persistedFaceId) {
                throw "Could not add this face!";
            }

            console.log('Added face!');

            let message = new botbuilder.Message()
                .address(address)
                .text('Ok! Got you registered. ');

            OC.face.personGroup.trainingStart(PERSON_GROUP_ID);
        }).catch(function (reason) {
            console.log(reason);
        })
    },
]);

dialog.matches('addFace', [
    function (session, args, next) {
        console.log('Adding face');

        /**
         * User needs to have registered first, and logged in.
        if (!(session.userData.personId && session.userData.loggedIn)) {
            return;    
        }*/

        console.log(session.userData);
        console.log(session.userData.personId);

        botbuilder.Prompts.attachment(session, 'Please take a photo of yourself and send it.');
    },
    function (session, result, next) {
        let address = session.message.address;

        let attachmentUrl = getPhotoAttachment(session);

        OC.face.person.addFace(
            PERSON_GROUP_ID,
            session.userData.personId,
            {
                url: attachmentUrl,
            }
        ).then(function (response) {
            if (!response.persistedFaceId) {
                throw "Could not add this face!";
            }

            console.log('Added face!');

            let message = new botbuilder.Message()
                .address(address)
                .text('Ok! Got your extra photo processed.');

            bot.send(message);

           return OC.face.personGroup.trainingStart(PERSON_GROUP_ID);
        }).catch(function (error) {
            console.log(error);
        });
    }
]);

dialog.matches('login', [
    function (session, args, next) {
        console.log('logging in');
        botbuilder.Prompts.attachment(session, 'Please take a photo of yourself and send it.');
    },
    function (session, results) {
        let address = session.message.address;
        let weChatId = session.message.user.id;

        let attachmentUrl = getPhotoAttachment(session);

        session.send('Thanks!');

        OC.face.detect({
            url: attachmentUrl,
            returnFaceId: true,
        }).then(function (response) {
            console.log('Detecting face');
            let detectedFace = response[0].faceId;

            return OC.face.identify(
                [detectedFace],
                PERSON_GROUP_ID,
                1,
                0.92
            );
        }).then(function (response) {
            console.log('Identified face');

            let closestCandidate = response[0].candidates[0].personId;
            session.userData.personId = closestCandidate;
            console.log(session.userData);

            return OC.face.person.get(
                PERSON_GROUP_ID,
                closestCandidate
            );
        }).then(function (response) {
            console.log('Got closest candidate');

            let message = new botbuilder.Message().address(address).text('Hi! ' + response.name + ' your wechat id is: ' + response.userData + ' and you are now logged in.');
           
            // "log in" the user.
            // session.userData.loggedIn = true;

            bot.send(message);
        }).catch(function (reason) {
            console.log(reason);
        })
    }
]);

dialog.matches('help', function (session) {
    session.send('what do you need help with?');
});

dialog.onDefault(function (session) {
    session.send('hmmm didnt get that');
});



function getPhotoAttachment (session) {
    let attachment = session.message.attachments[0];

    if (attachment.contentType !== 'wechat/image') {
        return;
    }

    return attachment.content.url;
};