import axios from 'axios';

// Helper function untuk delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fungsi utama spam NGL
async function spamngl(link, pesan, jumlah) {
    if (!link.startsWith('https://ngl.link/')) throw new Error('Link harus berupa https://ngl.link/');
    if (!pesan) throw new Error('Pesan tidak boleh kosong');
    if (isNaN(jumlah) || jumlah < 1) throw new Error('Jumlah harus angka minimal 1');

    const username = link.split('https://ngl.link/')[1];
    if (!username) throw new Error('Username tidak ditemukan dari link');

    const results = {
        success: 0,
        failed: 0,
        attempts: jumlah
    };

    for (let i = 0; i < jumlah; i++) {
        try {
            const response = await axios.post('https://ngl.link/api/submit', 
                `username=${username}&question=${encodeURIComponent(pesan)}&deviceId=${i + 1}`,
                {
                    headers: {
                        'accept': '*/*',
                        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                }
            );

            if (response.status === 200) {
                results.success++;
            } else {
                results.failed++;
                console.error(`Gagal kirim ${i + 1}:`, response.status);
            }

            await delay(1500); // Delay 1.5 detik antara setiap request

        } catch (err) {
            results.failed++;
            console.error('Gagal kirim:', err.message);
        }
    }

    return {
        username: username,
        message: pesan,
        total_attempts: jumlah,
        success: results.success,
        failed: results.failed,
        success_rate: `${((results.success / jumlah) * 100).toFixed(1)}%`,
        final_message: `Selesai mengirim ${results.success} pesan ke ${username}`
    };
}

// Handler utama
export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // GET - Info & Quick spam
        if (req.method === 'GET') {
            const { action, link, message, count } = req.query;

            // Endpoint info
            if (action === 'info' || (!link && !message && !count)) {
                return res.json({
                    status: true,
                    creator: "DinzID",
                    service: "NGL Spam API",
                    endpoints: {
                        post_spam: "POST /api/ngl/spam",
                        get_quick: "GET /api/ngl/spam?action=spam",
                        check: "GET /api/ngl/spam?action=check",
                        info: "GET /api/ngl/spam?action=info"
                    },
                    parameters: {
                        link: "https://ngl.link/username (required)",
                        message: "Pesan yang akan dikirim (required)",
                        count: "Jumlah pesan (1-50)"
                    },
                    limits: {
                        max_count: 50,
                        delay: "1.5 detik per request",
                        rate_limit: "Hindari spam berlebihan"
                    },
                    examples: {
                        post: {
                            "link": "https://ngl.link/exampleuser",
                            "message": "Hai! Ini test message",
                            "count": 3
                        },
                        get: "/api/ngl/spam?action=spam&link=https://ngl.link/exampleuser&message=Hai&count=3"
                    }
                });
            }

            // Endpoint check link
            if (action === 'check') {
                if (!link) {
                    return res.status(400).json({
                        status: false,
                        error: 'Parameter link diperlukan'
                    });
                }

                if (!link.startsWith('https://ngl.link/')) {
                    return res.json({
                        status: false,
                        valid: false,
                        error: 'Format link tidak valid'
                    });
                }

                const username = link.split('https://ngl.link/')[1];
                
                try {
                    const testResponse = await axios.post('https://ngl.link/api/submit', 
                        `username=${username}&question=test&deviceId=0`,
                        {
                            headers: {
                                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
                            },
                            timeout: 10000
                        }
                    );

                    return res.json({
                        status: true,
                        valid: testResponse.status !== 404,
                        username: username,
                        checked_at: new Date().toISOString()
                    });

                } catch (error) {
                    return res.json({
                        status: true,
                        valid: false,
                        username: username,
                        error: 'Link mungkin tidak valid'
                    });
                }
            }

            // Endpoint quick spam (GET)
            if (action === 'spam' || (link && message && count)) {
                if (!link || !message || !count) {
                    return res.status(400).json({
                        status: false,
                        error: 'Parameter link, message, dan count diperlukan',
                        example: '/api/ngl/spam?action=spam&link=https://ngl.link/username&message=Hai&count=3'
                    });
                }

                const jumlah = parseInt(count);
                if (isNaN(jumlah) || jumlah < 1 || jumlah > 50) {
                    return res.status(400).json({
                        status: false,
                        error: 'Count harus angka antara 1-50'
                    });
                }

                console.log(`⚡ Quick spam NGL: ${link}`);

                const result = await spamngl(link, message, jumlah);

                return res.json({
                    status: true,
                    creator: "DinzID",
                    result: result
                });
            }

            // Default response untuk GET tanpa parameter
            return res.json({
                status: true,
                message: "NGL Spam API",
                usage: "Gunakan parameter action=info untuk melihat dokumentasi"
            });
        }

        // POST - Spam NGL
        if (req.method === 'POST') {
            const { link, message, count } = req.body;

            // Validasi parameter
            if (!link) {
                return res.status(400).json({
                    status: false,
                    error: 'Parameter link diperlukan',
                    example: {
                        "link": "https://ngl.link/username",
                        "message": "Hai guys!",
                        "count": 5
                    }
                });
            }

            if (!message) {
                return res.status(400).json({
                    status: false,
                    error: 'Parameter message diperlukan'
                });
            }

            if (!count || count < 1 || count > 50) {
                return res.status(400).json({
                    status: false,
                    error: 'Parameter count diperlukan (1-50)'
                });
            }

            console.log(`📤 Spamming NGL: ${link}, ${count} messages`);

            const result = await spamngl(link, message, count);

            return res.json({
                status: true,
                creator: "DinzID",
                result: result
            });
        }

        // Method not allowed
        return res.status(405).json({
            status: false,
            error: 'Method not allowed'
        });

    } catch (error) {
        console.error('NGL Spam Error:', error.message);
        
        return res.status(500).json({
            status: false,
            error: error.message
        });
    }
}
