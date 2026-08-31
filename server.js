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

// Google Apps Script URL
const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbxqGhlM-iMBIl4J6Kqv5CXU_LE7T3STYDo_FDp-BTaM_HD9a1XPLrU83527Pqw0icaG/exec';

// Endpoint to receive RSVP
app.post('/api/rsvp', async (req, res) => {
    const { name, guests, attendance, message } = req.body;
    
    if (!name || !attendance) {
        return res.status(400).json({ error: 'Nombre y asistencia son requeridos.' });
    }

    try {
        // Enviar a Google Sheets
        const response = await fetch(GOOGLE_SHEET_URL, {
            method: 'POST',
            body: JSON.stringify({ name, guests, attendance, message })
        });
        
        if (response.ok) {
            // (Opcional) Aún lo guardamos localmente por si acaso
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

            res.status(201).json({ success: true });
        } else {
            console.error("Error from Google Sheets:", response.statusText);
            res.status(500).json({ error: 'Error al guardar en Google Sheets' });
        }
    } catch (error) {
        console.error("Error sending to Google Sheets:", error);
        res.status(500).json({ error: 'Error de red' });
    }
});

// Endpoint to get all RSVPs (for the Agenda page)
app.get('/api/rsvps', async (req, res) => {
    try {
        const sheetId = '1s7b0jQV6hVv3TA19mtS7xeLX4ceSY6QGuG4wrBJFMz8';
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
        const response = await fetch(url);
        const text = await response.text();
        
        // Remove Google's JSONP padding
        const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
        if (match && match[1]) {
            const data = JSON.parse(match[1]);
            const rows = data.table.rows;
            
            const rsvps = rows.map(row => {
                const isYes = row.c[1] && row.c[1].v === 'Sí asistirá';
                
                // Parse date (comes as "Date(2026, 7, 31, 11, 26, 36)" or similar string)
                let timestamp = new Date().toISOString();
                if (row.c[4] && row.c[4].v) {
                    const dateMatch = row.c[4].v.match(/Date\((\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/);
                    if (dateMatch) {
                        timestamp = new Date(dateMatch[1], dateMatch[2], dateMatch[3], dateMatch[4], dateMatch[5], dateMatch[6]).toISOString();
                    }
                }

                return {
                    name: row.c[0] ? row.c[0].v : '',
                    attendance: isYes ? 'yes' : 'no',
                    guests: row.c[2] ? parseInt(row.c[2].v) || 0 : 0,
                    message: row.c[3] ? row.c[3].v : '',
                    timestamp: timestamp
                };
            });
            
            res.json(rsvps);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error("Error fetching from Google Sheets API:", error);
        res.status(500).json([]);
    }
});

// Route for the secret Agenda page
app.get('/Agenda', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'agenda.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
