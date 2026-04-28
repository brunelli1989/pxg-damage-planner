import { createTheme } from "@mui/material/styles";

/**
 * Tema MUI customizado pro PxG Damage Planner.
 * Cores espelham os tokens em @theme do index.css mas em formato MUI palette.
 */
export const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#1a1a2e",   // bg-app
      paper: "#16213e",     // bg-card
    },
    primary: {
      main: "#4a90d9",      // accent-blue
      light: "#7bb8f0",
      dark: "#357abd",
      contrastText: "#fff",
    },
    secondary: {
      main: "#ffb347",      // accent (damage amarelo)
      contrastText: "#1a1a2e",
    },
    success: {
      main: "#27ae60",      // CC yes / OK
      contrastText: "#fff",
    },
    error: {
      main: "#c0392b",      // CC no / danger
      contrastText: "#fff",
    },
    warning: {
      main: "#f39c12",
      contrastText: "#1a1a2e",
    },
    text: {
      primary: "#e0e0e0",
      secondary: "#aaa",
      disabled: "#666",
    },
    divider: "#2d3a5e",
  },
  typography: {
    fontFamily: "system-ui, -apple-system, sans-serif",
    h1: { fontSize: "1.75rem", fontWeight: 700 },
    h2: { fontSize: "1.25rem", fontWeight: 600 },
    h3: { fontSize: "1rem", fontWeight: 600 },
    body1: { fontSize: "0.9rem" },
    body2: { fontSize: "0.85rem" },
    caption: { fontSize: "0.75rem" },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },  // remove gradient default do dark mode
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
  },
});
