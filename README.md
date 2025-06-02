# AbstructionAI

AbstructionAI is an intelligent tutoring application that provides clear explanations of complex concepts with customizable analogies and rich learning resources.

![AbstructionAI Logo](path/to/logo.png) <!-- Consider adding a logo image -->

## Features

- **Dynamic Explanations**: Receive comprehensive explanations of complex topics tailored to your learning preferences
- **Custom Analogies**: Get analogies from various domains (gaming, sports, cooking, etc.) that help make abstract concepts concrete
- **Interactive Feedback**: Provide feedback to improve explanations and get regenerated responses that match your preferences
- **Resource Recommendations**: Access curated learning resources for each explained concept
- **Conversation History**: Save and revisit previous conversations
- **User Preferences**: Set your preferences for technical depth, visual learning, and practical examples

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/AbstructionAI.git
cd AbstructionAI
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your OpenAI API key and other settings
```

4. Start the development server
```bash
npm run dev
# or
yarn dev
```

5. Navigate to `http://localhost:3000` in your browser

## Usage

1. Log in or register to start a new session
2. Type your question in the input field and submit
3. Review the AI's response with explanation, analogy, and resources
4. Provide feedback to get an improved response tailored to your preferences
5. Create new conversations or revisit past discussions from the sidebar

## Technical Architecture

- **Frontend**: React with TailwindCSS for styling
- **Backend**: Express.js server for API handling
- **AI**: OpenAI GPT-4o for generating responses
- **Authentication**: Supabase Auth
- **Storage**: Local storage and Supabase database for persistent data

## Feedback System

The application features a sophisticated feedback system that allows users to:
- Rate response quality
- Specify if explanations were clear enough
- Indicate preference for more detailed or simpler explanations
- Request analogies from specific domains (gaming, sports, music, etc.)
- Provide custom comments for improvements

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for the GPT models
- Supabase for authentication and database services
- All contributors who have helped shape this project