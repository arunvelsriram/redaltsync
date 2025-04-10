package main

import (
	"embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/static"
	"github.com/gofiber/template/html/v2"
	"github.com/joho/godotenv"
)

//go:embed templates/*
var templateFS embed.FS

//go:embed static/*
var staticFS embed.FS

type HealthResponse struct {
	Status string `json:"status"`
}

// Reddit OAuth configuration
var (
	clientID     string
	clientSecret string
	redirectURI  string
	userAgent    = "RedAltSync/1.0"
)

func init() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Get environment variables
	clientID = os.Getenv("REDDIT_CLIENT_ID")
	clientSecret = os.Getenv("REDDIT_CLIENT_SECRET")
	redirectURI = os.Getenv("REDDIT_REDIRECT_URI")

	// Set default redirect URI if not provided
	if redirectURI == "" {
		redirectURI = "http://localhost:3000/auth/callback"
	}

	// Log configuration
	log.Printf("Reddit OAuth Configuration: Client ID: %s, Redirect URI: %s",
		clientID, redirectURI)
}

func main() {
	// Initialize template engine with embedded templates
	engine := html.NewFileSystem(http.FS(templateFS), ".html")

	// Create new Fiber app
	app := fiber.New(fiber.Config{
		Views: engine,
	})

	// Serve static files
	app.Get("/static/*", static.New("/static", static.Config{
		FS:     staticFS,
		Browse: true,
	}))

	// Health check endpoint
	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(HealthResponse{
			Status: "healthy",
		})
	})

	// Home page endpoint
	app.Get("/", func(c fiber.Ctx) error {
		return c.Render("templates/index", fiber.Map{
			"Title": "Welcome to RedAltSync",
		})
	})

	// OAuth endpoint for both source and target accounts
	app.Get("/auth", func(c fiber.Ctx) error {
		if clientID == "" {
			return c.Status(500).SendString("Reddit client ID not configured")
		}

		account := c.Query("account")
		if account != "source" && account != "target" {
			return c.Status(400).SendString("Invalid account type. Must be 'source' or 'target'")
		}

		state := "source_account"
		if account == "target" {
			state = "target_account"
		}

		// Determine scopes based on account type
		scopes := "identity,mysubreddits"
		if account == "target" {
			scopes += ",subscribe"
		}

		// Construct the OAuth URL
		authURL := fmt.Sprintf(
			"https://www.reddit.com/api/v1/authorize?client_id=%s&response_type=code&state=%s&redirect_uri=%s&duration=permanent&scope=%s",
			clientID,
			state,
			redirectURI,
			scopes,
		)

		return c.Redirect().To(authURL)
	})

	// OAuth callback endpoint
	app.Get("/auth/callback", func(c fiber.Ctx) error {
		code := c.Query("code")
		state := c.Query("state")
		accountType := "source"
		if state == "target_account" {
			accountType = "target"
		}

		// Check for OAuth errors
		if err := c.Query("error"); err != "" {
			log.Printf("OAuth error: %s", err)
			return c.Render("templates/auth-result", fiber.Map{
				"Error":        true,
				"ErrorMessage": fmt.Sprintf("Authentication failed: %s", err),
			})
		}

		// Exchange the code for a token
		token, err := getRedditToken(code)
		if err != nil {
			log.Printf("Error getting token: %v", err)
			return c.Render("templates/auth-result", fiber.Map{
				"Error":        true,
				"ErrorMessage": "Failed to get access token. Please try again.",
			})
		}

		// Render the success state
		return c.Render("templates/auth-result", fiber.Map{
			"Error":       false,
			"AccountType": accountType,
			"Token":       token,
		})
	})

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	// Start server
	log.Printf("Server starting on port %s", port)
	log.Fatal(app.Listen(":" + port))
}

// getRedditToken exchanges an authorization code for an access token
func getRedditToken(code string) (string, error) {
	// Prepare the request
	data := url.Values{}
	data.Set("grant_type", "authorization_code")
	data.Set("code", code)
	data.Set("redirect_uri", redirectURI)

	// Create the request
	req, err := http.NewRequest("POST", "https://www.reddit.com/api/v1/access_token", strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("error creating request: %w", err)
	}

	// Set headers
	auth := base64.StdEncoding.EncodeToString([]byte(clientID + ":" + clientSecret))
	req.Header.Set("Authorization", "Basic "+auth)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", userAgent)

	// Send the request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("error sending request: %w", err)
	}
	defer resp.Body.Close()

	// Read the response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("error reading response body: %w", err)
	}

	// Check for non-200 status code
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse the response
	var result struct {
		AccessToken      string `json:"access_token"`
		TokenType        string `json:"token_type"`
		ExpiresIn        int    `json:"expires_in"`
		Scope            string `json:"scope"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("error parsing response: %w", err)
	}

	// Check for API errors
	if result.Error != "" {
		return "", fmt.Errorf("reddit API error: %s - %s", result.Error, result.ErrorDescription)
	}

	if result.AccessToken == "" {
		return "", fmt.Errorf("no access token in response")
	}

	return result.AccessToken, nil
}
