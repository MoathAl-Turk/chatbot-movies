const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

const TMDB_SEARCH_URL = "https://api.themoviedb.org/3/search/movie";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w200";

function getApiKey() {
    let key = sessionStorage.getItem('tmdb_key');
    if (!key) {
        key = prompt("Please enter your TMDB API Read Access Token (v4 auth):");
        if (key) sessionStorage.setItem('tmdb_key', key.trim());
    }
    return key;
}

function appendMessage(sender, content, isHtml = false) {
    const bubble = document.createElement('div');
    bubble.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
    if (isHtml) bubble.innerHTML = content;
    else bubble.textContent = content;
    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function handleSend() {
    let query = userInput.value.trim();
    if (!query) return;

    // 1. Show user message
    appendMessage('user', query);
    userInput.value = '';

    const lowerQuery = query.toLowerCase();

    // 2. Intercept specific conversational prompts (The Easter Egg!)
    if (lowerQuery.includes("who made u") || lowerQuery.includes("who created you")) {
        setTimeout(() => {
            appendMessage('bot', "I was created by MOATH KHALED AL-TURK! He is a software engineering student who builds efficient and intelligent applications. Do you need a movie recommendation?");
        }, 500);
        return;
    }

    if (lowerQuery === "hi" || lowerQuery === "hello" || lowerQuery === "hey") {
        setTimeout(() => {
            appendMessage('bot', "Hello! I'm CineBot. I can help you find movies, give you synopses, or recommend categories. What are you in the mood to watch?");
        }, 500);
        return;
    }

    // 3. If it's a movie search, proceed to TMDB
    const token = getApiKey();
    if (!token) {
        appendMessage('bot', "I need your TMDB API token to search the archives.");
        return;
    }

    const thinkingBubble = document.createElement('div');
    thinkingBubble.classList.add('message', 'bot-message');
    thinkingBubble.textContent = "Thinking...";
    chatBox.appendChild(thinkingBubble);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const url = `${TMDB_SEARCH_URL}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json;charset=utf-8"
            }
        });

        const data = await response.json();
        thinkingBubble.remove();

        if (!data.results || data.results.length === 0) {
            appendMessage('bot', `I actually couldn't find any movies related to "${query}". Maybe try a different title or genre?`);
            return;
        }

        // 4. Conversational Wrapper for Results
        const topMovies = data.results.slice(0, 2);
        
        // Pick a random conversational intro to make the AI feel alive
        const intros = [
            `I found some great options for "${query}". Here is what you should check out:`,
            `Absolutely! If you're looking for "${query}", these are highly recommended:`,
            `I've searched the database. Here are the top matches for "${query}":`
        ];
        const randomIntro = intros[Math.floor(Math.random() * intros.length)];

        let replyHtml = `${randomIntro}<br>`;

        topMovies.forEach(movie => {
            const poster = movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : 'https://via.placeholder.com/80x120?text=No+Poster';
            const year = movie.release_date ? movie.release_date.substring(0, 4) : 'N/A';
            const rating = movie.vote_average ? `⭐ ${movie.vote_average.toFixed(1)}/10` : 'Unrated';
            const overview = movie.overview ? (movie.overview.substring(0, 120) + '...') : 'No description available.';

            replyHtml += `
                <div class="movie-card">
                    <img src="${poster}" alt="${movie.title}">
                    <div class="movie-details">
                        <div class="movie-title">${movie.title}</div>
                        <div class="movie-meta">${year} • ${rating}</div>
                        <div class="movie-plot">${overview}</div>
                    </div>
                </div>
            `;
        });

        appendMessage('bot', replyHtml, true);

    } catch (error) {
        thinkingBubble.remove();
        appendMessage('bot', `Sorry, my connection to the movie database failed: ${error.message}`);
    }
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
});
