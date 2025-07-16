import express from 'express';
import axios from 'axios';
import cors from 'cors';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

try {
  execSync('ffmpeg -version');
  console.log('ffmpeg encontrado');
} catch (e) {
  console.error('ffmpeg não encontrado! Instale ffmpeg no sistema.');
  process.exit(1);
}

const TMP_FOLDER = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP_FOLDER)) {
  fs.mkdirSync(TMP_FOLDER);
}

async function getTikTokVideoURL(tiktokURL) {
  try {
    // Resolve link final (segue redirects e parâmetros)
    const resolvedURL = await axios.get(tiktokURL, {
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400,
    }).then(res => res.request.res.responseUrl);

    if (!resolvedURL) return null;

    const cleanUrl = resolvedURL.split('?')[0];

    const apiUrl = `https://api.tikmate.app/api/lookup?url=${encodeURIComponent(cleanUrl)}`;
    const res = await axios.get(apiUrl);

    if (res.data && res.data.video && res.data.video[0]) {
      return res.data.video[0].url;
    }
  } catch (error) {
    console.error('Erro ao pegar link do vídeo TikTok:', error.message);
  }
  return null;
}

app.post('/download', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Informe a URL do vídeo TikTok no body (json: { url })' });
  }

  try {
    const videoURL = await getTikTokVideoURL(url);
    if (!videoURL) return res.status(400).json({ error: 'Não consegui pegar link do vídeo TikTok.' });

    const videoFilename = `video_${Date.now()}.mp4`;
    const videoPath = path.join(TMP_FOLDER, videoFilename);
    const writer = fs.createWriteStream(videoPath);

    const response = await axios({
      url: videoURL,
      method: 'GET',
      responseType: 'stream',
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const audioFilename = `audio_${Date.now()}.mp3`;
    const audioPath = path.join(TMP_FOLDER, audioFilename);

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioBitrate(128)
        .save(audioPath)
        .on('end', resolve)
        .on('error', reject);
    });

    res.json({
      video_download: `/video/${videoFilename}`,
      audio_download: `/audio/${audioFilename}`,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.get('/video/:filename', (req, res) => {
  const filePath = path.join(TMP_FOLDER, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath, () => fs.unlink(filePath, () => {}));
  } else {
    res.status(404).send('Arquivo de vídeo não encontrado');
  }
});

app.get('/audio/:filename', (req, res) => {
  const filePath = path.join(TMP_FOLDER, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath, () => fs.unlink(filePath, () => {}));
  } else {
    res.status(404).send('Arquivo de áudio não encontrado');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
