const express = require('express');
const multer = require('multer');
const { JSDOM } = require('jsdom');
const JSZip = require('jszip');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() }); // メモリ上で処理（ディスクを汚さない）

// フロントエンド用の静的ファイル（HTML）を表示
app.use('/', express.static(path.join(__dirname, 'public')));

app.post('/convert', upload.single('htmlfile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('ファイルがアップロードされていません。');
        }

        const originalName = path.parse(req.file.originalname).name;
        const htmlContent = req.file.buffer.toString('utf-8');

        // JSDOMでHTMLをパース
        const dom = new JSDOM(htmlContent);
        const doc = dom.window.document;

        let cssContent = '';
        let jsContent = '';

        // 1. <style> タグの抽出と削除
        const styles = doc.querySelectorAll('style');
        styles.forEach(style => {
            cssContent += style.textContent + '\n';
            style.remove();
        });

        // 2. 内包された <script> タグの抽出と削除（外部読み込みsrc持ちは除外）
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            if (script.textContent && !script.hasAttribute('src')) {
                jsContent += script.textContent + '\n';
                script.remove();
            }
        });

        // 3. リンクの自動挿入
        // <head>の末尾にCSSリンクを追加
        if (cssContent.trim() && doc.head) {
            const link = doc.createElement('link');
            link.rel = 'stylesheet';
            link.href = `${originalName}.css`;
            doc.head.appendChild(link);
        }

        // <body>の末尾にJSリンクを追加
        if (jsContent.trim() && doc.body) {
            const scriptTag = doc.createElement('script');
            scriptTag.src = `${originalName}.js`;
            doc.body.appendChild(scriptTag);
        }

        // 4. ZIPファイルの作成
        const zip = new JSZip();
        zip.file(`${originalName}.html`, dom.serialize());

        if (cssContent.trim()) {
            zip.file(`${originalName}.css`, cssContent.trim());
        }
        if (jsContent.trim()) {
            zip.file(`${originalName}.js`, jsContent.trim());
        }

        // ZIPをバイナリとして生成し、レスポンスとして返す
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${originalName}_split.zip"`);
        res.send(zipBuffer);

    } catch (error) {
        console.error(error);
        res.status(500).send('サーバー内部エラーが発生しました。');
    }
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
