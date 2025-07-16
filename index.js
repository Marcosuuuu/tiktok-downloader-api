import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

try {
  execSync('ffmpeg -version');
  console.log('ffmpeg encontrado!');
} catch (e) {
  console.error('⚠️ ffmpeg não encontrado! Instale no sistema.');
  process.exit(1);
}

const TMP_FOLDER = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP_FOLDER)) {
  fs.mkdirSync(TMP_FOLDER);
}

async function getTikTokMedia(url) {
  try {
    const response = await axios.post(
      'https://ttsave.app/api/ajax/search',
      new URLSearchParams({ q: url }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0',
        },
      }
    );

    const data = response.data;
    if (data && data.status && data.links) {
      return {
        video: data.links.nowm,
        audio: data.links.music,
      };
    }
  } catch (err) {
    console.error('Erro ao buscar mídia:', err.message);
  }
  return null;
}

app.post('/download', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL do TikTok ausente.' });
  }

  const media = await getTikTokMedia(url);
  if (!media) {
    return res.status(500).json({ error: 'Não foi possível obter os links.' });
  }

  const videoName = `video_${Date.now()}.mp4`;
  const audioName = `audio_${Date.now()}.mp3`;
  const videoPath = path.join(TMP_FOLDER, videoName);
  const audioPath = path.join(TMP_FOLDER, audioName);

  const videoStream = fs.createWriteStream(videoPath);
  const audioStream = fs.createWriteStream(audioPath);

  try {
    const videoRes = await axios.get(media.video, { responseType: 'stream' });
    videoRes.data.pipe(videoStream);

    await new Promise((resolve, reject) => {
      videoStream.on('finish', resolve);
      videoStream.on('error', reject);
    });

    const musicRes = await axios.get(media.audio, { responseType: 'stream' });
    musicRes.data.pipe(audioStream);

    await new Promise((resolve, reject) => {
      audioStream.on('finish', resolve);
      audioStream.on('error', reject);
    });

    res.json({
      video_download: `/video/${videoName}`,
      audio_download: `/audio/${audioName}`,
    });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Erro ao baixar arquivos.' });
  }
});

app.get('/video/:filename', (req, res) => {
  const filePath = path.join(TMP_FOLDER, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath, () => fs.unlink(filePath, () => {}));
  } else {
    res.status(404).send('Vídeo não encontrado');
  }
});

app.get('/audio/:filename', (req, res) => {
  const filePath = path.join(TMP_FOLDER, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath, () => fs.unlink(filePath, () => {}));
  } else {
    res.status(404).send('Áudio não encontrado');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
