const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

const TMDB_SEARCH_URL = "https://api.themoviedb.org/3/search/movie";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w200";
// We use Hugging Face's router which allows OpenAI-style conversational chatting
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL = "google/gemma-2-2b-it";

// 1. The System Prompt & Chat History
// This is the "brain". It tells the AI who it is and remembers past messages.
let chatHistory = [
    {
        role: "system",
        content: "You are CineBot, a friendly and knowledgeable AI movie critic, created by Moath Al-Turk. Always be conversational, concise, and helpful. You can chat normally about anything movie-related (opinions, small talk, follow-up questions) even when no database context is given. If context from TMDB is provided in a message, use those facts naturally in your answer instead of guessing."
    }
];

function getApiKeys() {
    let tmdbKey = sessionStorage.getItem('tmdb_key');
    let hfKey = sessionStorage.getItem('hf_key');

    if (!tmdbKey) {
        tmdbKey = prompt("Please enter your TMDB API Read Access Token (v4 auth):");
        if (tmdbKey) sessionStorage.setItem('tmdb_key', tmdbKey.trim());
    }

    if (!hfKey) {
        hfKey = prompt("Please enter your Hugging Face API Token:");
        if (hfKey) sessionStorage.setItem('hf_key', hfKey.trim());
    }

    return { tmdbKey, hfKey };
}

function appendMessage(sender, content, isHtml = false) {
    const bubble = document.createElement('div');
    bubble.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');

    if (isHtml) bubble.innerHTML = content;
    else bubble.textContent = content;

    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
    return bubble;
}

// Small helper to call the Hugging Face chat endpoint.
async function callHF(messages, hfKey, maxTokens = 350) {
    const res = await fetch(HF_API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${hfKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: HF_MODEL,
            messages,
            max_tokens: maxTokens
        })
    });

    const data = await res.json();
    if (data.error) {
        throw new Error(data.error.message || "Hugging Face Error");
    }
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("Unexpected response from Hugging Face API");
    }
    return data.choices[0].message.content.trim();
}

// STEP 1: Ask the model whether this message actually needs a TMDB lookup,
// and if so, what to search for. This is what lets the bot hold a normal
// conversation instead of treating every message as a movie search.
async function detectMovieIntent(query, hfKey) {
    const recentTurns = chatHistory.slice(-6); // small window of context is enough

    const classifierMessages = [
        {
            role: "system",
            content: "You are an intent router for a movie chatbot. Look at the user's latest message. " +
                "If it mentions a specific movie title, asks for a movie's plot/rating/release info, or asks for a recommendation tied to a specific title or clear genre, respond with exactly: MOVIE: <best search query>. " +
                "Otherwise (greetings, opinions, small talk, follow-up questions about something already discussed, general chit-chat) respond with exactly: NONE. " +
                "Respond with nothing else, no explanation."
        },
        ...recentTurns,
        { role: "user", content: query }
    ];

    try {
        const result = await callHF(classifierMessages, hfKey, 30);
        const match = result.match(/^MOVIE:\s*(.+)/i);
        if (match) {
            return { needsSearch: true, searchQuery: match[1].trim() };
        }
        return { needsSearch: false, searchQuery: null };
    } catch (err) {
        // If the classifier call fails for any reason, fail safe into normal chat.
        console.warn("Intent detection failed, defaulting to plain chat:", err);
        return { needsSearch: false, searchQuery: null };
    }
}

// STEP 2: Query TMDB and build both the AI context string and the visual cards.
async function fetchMovieContext(searchQuery, tmdbKey) {
    const tmdbUrl = `${TMDB_SEARCH_URL}?query=${encodeURIComponent(searchQuery)}&include_adult=false&language=en-US&page=1`;
    const tmdbRes = await fetch(tmdbUrl, {
        headers: {
            "Authorization": `Bearer ${tmdbKey}`,
            "Content-Type": "application/json;charset=utf-8"
        }
    });
    const tmdbData = await tmdbRes.json();

    let tmdbContext = "";
    let movieCardsHtml = "";

    if (tmdbData.results && tmdbData.results.length > 0) {
        const topMovies = tmdbData.results.slice(0, 2);
        tmdbContext = "Context from TMDB database:\n";

        topMovies.forEach(movie => {
            const year = movie.release_date ? movie.release_date.substring(0, 4) : 'N/A';
            const rating = typeof movie.vote_average === 'number' ? movie.vote_average.toFixed(1) : 'N/A';
            const overview = movie.overview || 'No description available.';

            tmdbContext += `- ${movie.title} (${year}). Rating: ${rating}. Plot: ${overview}\n`;

            const poster = movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : 'https://via.placeholder.com/80x120?text=No+Poster';
            movieCardsHtml += `
                <div class="movie-card">
                    <img src="${poster}" alt="${movie.title}">
                    <div class="movie-details">
                        <div class="movie-title">${movie.title}</div>
                        <div class="movie-meta">${year} • ⭐ ${rating}/10</div>
                        <div class="movie-plot">${overview.substring(0, 100)}...</div>
                    </div>
                </div>
            `;
        });
    }

    return { tmdbContext, movieCardsHtml };
}

async function handleSend() {
    let query = userInput.value.trim();
    if (!query) return;

    appendMessage('user', query);
    userInput.value = '';

    const keys = getApiKeys();
    if (!keys.tmdbKey || !keys.hfKey) {
        appendMessage('bot', "I need both TMDB and Hugging Face API keys to work properly!");
        return;
    }

    const thinkingBubble = appendMessage('bot', "Thinking...");

    try {
        // Add the user's real message to permanent memory first.
        chatHistory.push({ role: "user", content: query });

        // Decide whether this message needs a TMDB lookup at all.
        const { needsSearch, searchQuery } = await detectMovieIntent(query, keys.hfKey);

        let tmdbContext = "";
        let movieCardsHtml = "";

        if (needsSearch && searchQuery) {
            const context = await fetchMovieContext(searchQuery, keys.tmdbKey);
            tmdbContext = context.tmdbContext;
            movieCardsHtml = context.movieCardsHtml;
        }

        // Build the message list sent for the final reply. Only the LAST
        // user message gets the TMDB context spliced in (if any) — the rest
        // of the conversation history stays untouched so memory works normally.
        let messagesToSend = [...chatHistory];
        if (tmdbContext) {
            messagesToSend[messagesToSend.length - 1] = {
                role: "user",
                content: `${tmdbContext}\nUser's actual message: ${query}`
            };
        }

        const aiResponseText = await callHF(messagesToSend, keys.hfKey, 350);

        // Save the AI's real response (not the context-injected version) to memory.
        chatHistory.push({ role: "assistant", content: aiResponseText });

        thinkingBubble.remove();

        const finalHtml = `<p style="margin-top: 0;">${aiResponseText.replace(/\n/g, '<br>')}</p> ${movieCardsHtml}`;
        appendMessage('bot', finalHtml, true);

    } catch (error) {
        thinkingBubble.remove();
        console.error("Full error: ", error);
        appendMessage('bot', `Oops, something went wrong: ${error.message}`);
    }
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
});
