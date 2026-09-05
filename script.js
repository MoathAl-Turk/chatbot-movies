const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

const TMDB_SEARCH_URL = "https://api.themoviedb.org/3/search/movie";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w200";
// We use Hugging Face's router which allows OpenAI-style conversational chatting
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";

// 1. The System Prompt & Chat History
// This is the "brain". It tells the AI who it is and remembers past messages.
let chatHistory = [
    { 
        role: "system", 
        content: "You are CineBot, a friendly and knowledgeable AI movie critic. You were created by MOATH KHALED AL-TURK. Always be conversational, concise, and helpful. If context from TMDB is provided, use it to recommend movies naturally." 
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
        // We will need your Hugging Face key from the summarizer project!
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
        // Step 1: Query TMDB based on what the user typed
        const tmdbUrl = `${TMDB_SEARCH_URL}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;
        const tmdbRes = await fetch(tmdbUrl, {
            headers: {
                "Authorization": `Bearer ${keys.tmdbKey}`,
                "Content-Type": "application/json;charset=utf-8"
            }
        });
        const tmdbData = await tmdbRes.json();

        let tmdbContext = "";
        let movieCardsHtml = "";

        // If TMDB finds movies, format them into a hidden context string for the AI to read
        if (tmdbData.results && tmdbData.results.length > 0) {
            const topMovies = tmdbData.results.slice(0, 2);
            tmdbContext = "Context from TMDB database: \n";
            
            topMovies.forEach(movie => {
                const year = movie.release_date ? movie.release_date.substring(0, 4) : 'N/A';
                tmdbContext += `- ${movie.title} (${year}). Rating: ${movie.vote_average}. Plot: ${movie.overview}\n`;
                
                // Build the sleek visual UI cards for the frontend
                const poster = movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : 'https://via.placeholder.com/80x120?text=No+Poster';
                movieCardsHtml += `
                    <div class="movie-card">
                        <img src="${poster}" alt="${movie.title}">
                        <div class="movie-details">
                            <div class="movie-title">${movie.title}</div>
                            <div class="movie-meta">${year} • ⭐ ${movie.vote_average.toFixed(1)}/10</div>
                            <div class="movie-plot">${movie.overview.substring(0, 100)}...</div>
                        </div>
                    </div>
                `;
            });
        }

        // Add the user's message to the ongoing conversation memory
        chatHistory.push({ role: "user", content: query });

        // Step 2: Inject the TMDB database facts silently into the prompt
        let messagesToSend = [...chatHistory];
        if (tmdbContext) {
            messagesToSend[messagesToSend.length - 1] = {
                role: "user",
                content: `${tmdbContext}\n\nUser's actual message: ${query}`
            };
        }

        // Step 3: Send the entire conversation to the Hugging Face AI
        const hfRes = await fetch(HF_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${keys.hfKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "meta-llama/Llama-3.2-3B-Instruct", // A fast, smart conversational model
                messages: messagesToSend,
                max_tokens: 350
            })
        });

        const hfData = await hfRes.json();
        
        if (hfData.error) {
            throw new Error(hfData.error.message || "Hugging Face Error");
        }

        // Extract the AI's conversational response
        const aiResponseText = hfData.choices[0].message.content;

        // Save the AI's response to the memory so it has context for the NEXT question!
        chatHistory.push({ role: "assistant", content: aiResponseText });

        thinkingBubble.remove();

        // Step 4: Stitch the AI's natural text and your futuristic HTML movie cards together
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
