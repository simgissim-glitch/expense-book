import app from './app.js';
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`가계부 실행: http://localhost:${port}`));
