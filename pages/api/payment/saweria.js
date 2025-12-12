import axios from 'axios';
import cheerio from 'cheerio';

const BACKEND = 'https://backend.saweria.co';
const FRONTEND = 'https://saweria.co';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15'
};

// Cek status pembayaran
async function paidStatus(transactionId) {
    try {
        const response = await axios.get(`${BACKEND}/donations/qris/${transactionId}`, {
            headers,
            timeout: 20000
        });

        if (Math.floor(response.status / 100) !== 2) {
            throw new Error("Transaction ID is not found!");
        }

        const data = response.data.data || {};
        return {
            isPaid: data.qr_string === "",
            data: data
        };
    } catch (error) {
        if (error.response) {
            throw new Error("Transaction ID is not found!");
        }
        throw error;
    }
}

// Buat payment string
async function createPaymentString(saweriaUsername, amount, sender, email, pesan) {
    if (!saweriaUsername || !amount || !sender || !email || !pesan) {
        throw new Error("All parameters are required!");
    }
    
    if (amount < 10000) {
        throw new Error("Minimum amount is 10000");
    }

    console.log(`Loading ${FRONTEND}/${saweriaUsername}`);

    try {
        const response = await axios.get(`${FRONTEND}/${saweriaUsername}`, {
            headers,
            timeout: 20000
        });

        const $ = cheerio.load(response.data);
        const nextDataScript = $('#__NEXT_DATA__').html();

        if (!nextDataScript) {
            throw new Error("Saweria account not found");
        }

        const nextData = JSON.parse(nextDataScript);
        const userId = nextData?.props?.pageProps?.data?.id;

        if (!userId) {
            throw new Error("Saweria account not found");
        }

        const payload = {
            agree: true,
            notUnderage: true,
            message: pesan,
            amount: parseInt(amount),
            payment_type: "qris",
            vote: "",
            currency: "IDR",
            customer_info: {
                first_name: sender,
                email: email,
                phone: ""
            }
        };

        const postResponse = await axios.post(`${BACKEND}/donations/${userId}`, payload, {
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            }
        });

        return postResponse.data.data;
    } catch (error) {
        if (error.response) {
            throw new Error(error.response.data?.message || "Request failed");
        }
        throw error;
    }
}

// Buat payment QR
async function createPaymentQr(saweriaUsername, amount, sender, email, pesan) {
    const paymentDetails = await createPaymentString(saweriaUsername, amount, sender, email, pesan);
    return {
        qr_string: paymentDetails.qr_string,
        transaction_id: paymentDetails.id,
        amount: paymentDetails.amount,
        currency: paymentDetails.currency,
        expires_at: paymentDetails.expires_at
    };
}

// Handler API
export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // GET method - cek status pembayaran
        if (req.method === 'GET') {
            const { transaction_id } = req.query;

            if (!transaction_id) {
                return res.status(400).json({
                    status: false,
                    message: 'Parameter transaction_id is required'
                });
            }

            console.log('Checking payment status for:', transaction_id);
            const status = await paidStatus(transaction_id);

            return res.status(200).json({
                status: true,
                data: status,
                timestamp: new Date().toISOString()
            });

        } 
        // POST method - buat payment QR
        else if (req.method === 'POST') {
            const { username, amount, sender, email, message } = req.body;

            // Validasi required parameters
            if (!username || !amount || !sender || !email || !message) {
                return res.status(400).json({
                    status: false,
                    message: 'All parameters are required: username, amount, sender, email, message'
                });
            }

            // Validasi amount
            const amountNum = parseInt(amount);
            if (isNaN(amountNum) || amountNum < 10000) {
                return res.status(400).json({
                    status: false,
                    message: 'Minimum amount is 10000'
                });
            }

            // Validasi email format sederhana
            if (!email.includes('@')) {
                return res.status(400).json({
                    status: false,
                    message: 'Invalid email format'
                });
            }

            console.log('Creating payment QR for:', username);
            const payment = await createPaymentQr(username, amountNum, sender, email, message);

            return res.status(200).json({
                status: true,
                message: 'Payment QR created successfully',
                data: {
                    qr_string: payment.qr_string,
                    transaction_id: payment.transaction_id,
                    amount: payment.amount,
                    currency: payment.currency,
                    expires_at: payment.expires_at,
                    qr_image_url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payment.qr_string)}`,
                    instructions: [
                        'Scan QR code dengan aplikasi e-wallet atau mobile banking',
                        'Bayar sesuai nominal yang tertera',
                        'Pembayaran akan otomatis terkonfirmasi',
                        `Transaksi ID: ${payment.transaction_id}`
                    ]
                },
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('API Error:', error.message);

        // Return error berdasarkan jenis error
        let statusCode = 500;
        let errorMessage = error.message || 'Internal server error';

        if (error.message.includes('not found') || error.message.includes('account not found')) {
            statusCode = 404;
        } else if (error.message.includes('Minimum amount') || error.message.includes('Parameter')) {
            statusCode = 400;
        }

        return res.status(statusCode).json({
            status: false,
            message: errorMessage
        });
    }

    return res.status(405).json({
        status: false,
        message: 'Method not allowed'
    });
}
