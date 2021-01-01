const admin = require('firebase-admin'); const functions = require('firebase-functions'); const express = require('express'); const app = express();
const createDOMPurify = require('dompurify'); const { JSDOM } = require('jsdom'); const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window); const showdown = require('showdown'); const notfound = { title: 'TW' };
admin.initializeApp(functions.config().firebase); let db = admin.firestore();
let converter = new showdown.Converter(); //![alt text](dropbox?raw=1 or GDrive/uc?id=id) Create the link converter.
let safe_html = function (markdown) { return DOMPurify.sanitize(converter.makeHtml(markdown)); }
let make_collection = (question) => { return question ? 'questions' : 'answers'; }
const pug = require('pug'); app.set('view engine', 'pug')
app.get('/', (req, res) => { res.render('index', { title: 'TW' }); });
app.get('/user', (req, res) => { res.render('user', { title: 'TW' }); });
app.get('/user/question', (req, res) => { res.render('user/question', { title: 'TW' }); });
app.post('/post', (req, res) => {
    let token = req.header('Authorization').split(' ').pop();
    admin.auth().verifyIdToken(token).then(decodedToken => {
        let user_id = decodedToken.uid; let body = JSON.parse(req.body); let collection = make_collection(body['question']);
        let content = body['content']; let draft = body['draft']; let created = admin.firestore.Timestamp.now(); let data;
        if (body['question']) { data = { user_id: user_id, title: body['title'], content: content, draft: draft, created: created }; }
        else { data = { question_id: body['question_id'], user_id: user_id, content: content, draft: draft, created: created }; }
        db.collection(collection).add(data); res.send('posted'); return;
    }).catch();
});
app.get('/user/questions', (req, res) => { res.render('user/questions', { title: 'TW' }); });
app.post('/list', (req, res) => {
    let token = req.header('Authorization').split(' ').pop(); let body = JSON.parse(req.body); let last = body['last'];
    let collection = make_collection(body['question']); let items = 10; var docs;
    if (last) {
        docs = Promise.all([admin.auth().verifyIdToken(token), db.collection(collection).doc(last).get()]).then(([decodedToken, snapshot]) => {
            let startAfterSnapshot = db.collection(collection).where('user_id', '==', decodedToken.uid);
            return startAfterSnapshot.orderBy('created', 'desc').startAfter(snapshot).limit(items+1).get();
        });
    }
    else {
        docs = admin.auth().verifyIdToken(token).then((decodedToken) => {
            return db.collection(collection).where('user_id', '==', decodedToken.uid).orderBy('created', 'desc').limit(items+1).get();
        });
    }
    docs.then(snapshot => {
        if (snapshot.empty) { return; } let list = [];
        if (body['question']) {
            snapshot.forEach(doc => {
                let data = doc.data();
                list.push({ id: doc.id, title: data['title'], draft: data['draft'], created: data['created'] });
            });
            res.json({ items: list.slice(0, items), expandable: list.length === items+1 });
        }
        else {
            let promises = [];
            snapshot.forEach(doc => {
                let data = doc.data();
                promises.push(
                    db.collection('questions').doc(doc.data()['question_id']).get().then(questionDoc => {
                        if (!questionDoc.exists) { return; }
                        list.push({ id: doc.id, title: questionDoc.data()['title'], draft: data['draft'], created: data['created'] }); return;
                    }).catch()
                );
            });
            Promise.all(promises).then(() => {
                // todo: sort the list by created
                res.json({ items: list.slice(0, items), expandable: list.length === items+1 }); return;
            }).catch();
        } return;
    }).catch();
});
app.get('/question/:question_id', (req, res) => {
    let question_id = req.params['question_id'];
    db.collection('questions').doc(question_id).get().then(doc => {
        if (doc.exists) {
            let data = doc.data(); let title = data['title']; let content = data['content']; let draft = data['draft'];
            if (draft) { res.render('draft_question', { title: 'TW' }); }
            else { res.render('question', { title: title + ' - TW', question: title, content: safe_html(content) }); }
        } else { res.status(404).render('404', notfound); } return;
    }).catch();
});
app.post('/draft_question', (req, res) => {
    let token = req.header('Authorization').split(' ').pop(); let question_id = JSON.parse(req.body)['question_id'];
    Promise.all([admin.auth().verifyIdToken(token), db.collection('questions').doc(question_id).get()]).then(([decodedToken, doc]) => {
        if (doc.exists) {
            let data = doc.data(); let title = data['title']; let content = data['content']; let draft = data['draft']; let user_id = data['user_id'];
            if (draft && decodedToken.uid === user_id) { res.send({ title: title, content: content, notfound: false }); }
            else { res.send({ title: null, content: null, notfound: false }); }
        } else { res.send({ title: null, content: null, notfound: false }); } return;
    }).catch();
});
app.get('/user/answers', (req, res) => { res.render('user/answers', { title: 'TW' }); });
app.post('/delete', (req, res) => {
    let body = JSON.parse(req.body); let collection = make_collection(body['question']); let id = body['id'];
    let docRef = db.collection(collection).doc(id); let token = req.header('Authorization').split(' ').pop();
    Promise.all([admin.auth().verifyIdToken(token), docRef.get()]).then(([decodedToken, doc]) => {
        if (doc.exists && doc.data()['user_id'] === decodedToken.uid) { docRef.delete(); } res.send('Deleted'); return;
    }).catch();
});
app.post('/update', (req, res) => {
    let body = JSON.parse(req.body); let title = body['title']; let content = body['content']; let id = body['id'];
    let draft = body['draft']; let collection = make_collection(body['question']); let created = admin.firestore.Timestamp.now();
    let docRef = db.collection(collection).doc(id); let token = req.header('Authorization').split(' ').pop();
    Promise.all([admin.auth().verifyIdToken(token), docRef.get()]).then(([decodedToken, doc]) => {
        let data = { user_id: decodedToken.uid, title: title, content: content, draft: draft, created: created }; console.log(data);
        if (doc.exists && doc.data()['user_id'] === decodedToken.uid) { docRef.set(data); } res.send('Updated'); return;
    }).catch();
});
app.post('/mine', (req, res) => {
    let token = req.header('Authorization').split(' ').pop(); let body = JSON.parse(req.body); let id = body['id'];
    let collection = make_collection(body['question']);
    Promise.all([admin.auth().verifyIdToken(token), db.collection(collection).doc(id).get()]).then(([decodedToken, doc]) => {
        if (doc.exists) { var mine = (doc.data()['user_id'] === decodedToken.uid); } res.send({ mine: mine }); return;
    }).catch();
});
app.use((req, res, next) => { res.status(404).render('404', notfound); });
exports.app = functions.https.onRequest(app);