import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'rsvps.json');

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize data file if it doesn't exist
async function initDataFile() {
    try {
        await fs.access(DATA_FILE, constants.F_OK);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(DATA_FILE, JSON.stringify([]));
        }
    }
}
initDataFile();

// Helper to read data
const readData = async () => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading data:", error);
        return [];
    }
};

// Helper to write data
const writeData = async (data) => {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error writing data:", error);
    }
};

// Endpoint to receive RSVP
app.post('/api/rsvp', async (req, res) => {
    const { name, guests, attendance, message } = req.body;
    
    if (!name || !attendance) {
        return res.status(400).json({ error: 'Nombre y asistencia son requeridos.' });
    }

    const newRsvp = {
        id: Date.now().toString(),
        name,
        guests: parseInt(guests) || 0,
        attendance,
        message: message || '',
        timestamp: new Date().toISOString()
    };

    const rsvps = await readData();
    rsvps.push(newRsvp);
    await writeData(rsvps);

    res.status(201).json({ success: true, rsvp: newRsvp });
});

// Endpoint to get all RSVPs (for the Agenda page)
app.get('/api/rsvps', async (req, res) => {
    const rsvps = await readData();
    res.json(rsvps);
});

// Route for the secret Agenda page
app.get('/Agenda', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'agenda.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
