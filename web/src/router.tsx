import { createBrowserRouter } from "react-router-dom"

import { Layout } from "@/components/layout"
import { Home } from "@/pages/home"
import { Channels } from "@/pages/channels"
import { VideoGrid } from "@/pages/video-grid"
import { VideoDetailPage } from "@/pages/video-detail"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "channels", element: <Channels /> },
      { path: "videos", element: <VideoGrid /> },
      { path: "videos/:id", element: <VideoDetailPage /> },
    ],
  },
])
