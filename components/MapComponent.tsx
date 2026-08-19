"use client";

import { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  CircleMarker,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Play, Pause, Plus, Minus } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import {
  Cloud,
  Droplets,
  Thermometer,
  Wind,
  Eye,
  Gauge,
  CloudSnow,
  Waves,
} from "lucide-react";

// Station interface matching Prisma model
interface Station {
  id: string;
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  securityCode: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DailySummary {
  maxTemperature: string | null;
  minTemperature: string | null;
  totalPrecipitation: string | null;
  windSpeed: string | null;
  avTotalCloud: string | null;
}

interface WeatherRemark {
  stationId: string;
  weatherRemark: string | null;
}

interface WeatherLayerData {
  stationId: string;
  latitude: number;
  longitude: number;
  value: number;
  name: string;
}

interface MapComponentProps {
  currentDate: string;
  setCurrentDate: (date: string) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  selectedStation: Station | null;
  onStationSelect: (station: Station | null) => void;
}

type WeatherParameter =
  | "temperature"
  | "precipitation"
  | "wind"
  | "clouds"
  | "humidity"
  | "visibility"
  | "pressure"
  | "dewpoint";

// Weather parameter configuration
const weatherParameters = [
  {
    key: "temperature" as WeatherParameter,
    label: "Temperature",
    icon: Thermometer,
    color: "#f46b6b",
    unit: "°C",
  },
  {
    key: "precipitation" as WeatherParameter,
    label: "Precipitation",
    icon: Droplets,
    color: "#0d6cd9",
    unit: "mm",
  },
  {
    key: "wind" as WeatherParameter,
    label: "Wind",
    icon: Wind,
    color: "#19ec86",
    unit: "km/h",
  },
  {
    key: "clouds" as WeatherParameter,
    label: "Clouds",
    icon: Cloud,
    color: "#f46b6b",
    unit: "%",
  },
  {
    key: "humidity" as WeatherParameter,
    label: "Humidity",
    icon: Waves,
    color: "#93c47d",
    unit: "%",
  },
  {
    key: "visibility" as WeatherParameter,
    label: "Visibility",
    icon: Eye,
    color: "#478fa4",
    unit: "km",
  },
  {
    key: "pressure" as WeatherParameter,
    label: "Sea Level Pressure",
    icon: Gauge,
    color: "#f46b6b",
    unit: "hPa",
  },
  {
    key: "dewpoint" as WeatherParameter,
    label: "Dew Point",
    icon: CloudSnow,
    color: "#674ea7",
    unit: "°C",
  },
];

// Animated live location marker
function LiveLocationMarker({
  station,
}: {
  station: { coordinates: L.LatLngExpression } | null;
}) {
  const [pulseSize, setPulseSize] = useState(10);
  const pulseRef = useRef<L.CircleMarker>(null);

  useEffect(() => {
    if (!station) return;

    const interval = setInterval(() => {
      setPulseSize((prev) => (prev >= 30 ? 10 : prev + 2));
    }, 200);

    return () => clearInterval(interval);
  }, [station]);

  useEffect(() => {
    if (pulseRef.current) {
      pulseRef.current.setRadius(pulseSize);
    }
  }, [pulseSize]);

  if (!station) return null;

  return (
    <CircleMarker
      ref={pulseRef}
      center={station.coordinates}
      radius={10}
      pathOptions={{
        weight: 2,
        opacity: 0.7,
        fillOpacity: 0.3,
      }}
    />
  );
}

function FixLeafletIcons() {
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "/station-icon.png",
      iconUrl: "/station-icon.png",
      shadowUrl: "/station-icon.png",
    });
  }, []);

  return null;
}

function CustomZoomControl() {
  const map = useMap();

  return (
    <div className="absolute top-2 left-2 flex flex-col gap-1 z-[1000]">
      <Button
        size="icon"
        variant="secondary"
        onClick={() => map.zoomIn()}
        className="h-8 w-8 bg-white"
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="secondary"
        onClick={() => map.zoomOut()}
        className="h-8 w-8 bg-white"
      >
        <Minus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function StationMarkers({
  stations,
  selectedStation,
  onStationSelect,
  weatherData,
  weatherRemarks,
  currentDate,
  loading,
}: {
  stations: Station[];
  selectedStation: Station | null;
  onStationSelect: (station: Station | null) => void;
  weatherData: DailySummary | null;
  weatherRemarks: WeatherRemark[];
  currentDate: string;
  loading: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const map = useMap();

  const getStationIcon = (station: Station) => {
    const stationRemark = weatherRemarks.find(
      (remark) => remark.stationId === station.stationId,
    );
    let iconUrl = "/broadcasting.png";

    if (stationRemark?.weatherRemark) {
      const remarkParts = stationRemark.weatherRemark.split(" - ");
      if (remarkParts.length > 0 && remarkParts[0].trim()) {
        iconUrl = remarkParts[0].trim();
      }
    }

    return L.icon({
      iconUrl: iconUrl,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      className: stationRemark?.weatherRemark
        ? "weather-remark-icon"
        : "default-station-icon",
    });
  };

  const getWeatherDescription = (station: Station) => {
    const stationRemark = weatherRemarks.find(
      (remark) => remark.stationId === station.stationId,
    );
    if (stationRemark?.weatherRemark) {
      const remarkParts = stationRemark.weatherRemark.split(" - ");
      if (remarkParts.length > 1) {
        return remarkParts[1].trim();
      }
    }
    return "No weather remarks";
  };

  useEffect(() => {
    if (!selectedStation) {
      map.fitBounds([
        [20.5, 88.0],
        [26.5, 92.5],
      ]);
      return;
    }

    map.flyTo([selectedStation.latitude, selectedStation.longitude], 12, {
      duration: 1,
    });
  }, [selectedStation, map]);

  return (
    <>
      {stations.map((station) => {
        const stationIcon = getStationIcon(station);
        const weatherDescription = getWeatherDescription(station);
        const hasWeatherRemark = weatherRemarks.some(
          (remark) =>
            remark.stationId === station.stationId && remark.weatherRemark,
        );

        return (
          <Marker
            key={station.id}
            position={[station.latitude, station.longitude]}
            icon={stationIcon}
            eventHandlers={{
              click: () => onStationSelect(station),
              mouseover: (e) => {
                const marker = e.target;
                marker.openPopup();
              },
              mouseout: (e) => {
                const marker = e.target;
                marker.closePopup();
              },
            }}
          >
            <Popup
              className="min-w-[280px]"
              autoClose={false}
              closeOnClick={false}
            >
              <div className="font-bold text-lg">{station.name}</div>
              <div className="text-sm">Station ID: {station.stationId}</div>
              <div className="text-sm mb-2">
                Coordinates: {station.latitude.toFixed(4)},{" "}
                {station.longitude.toFixed(4)}
              </div>

              {hasWeatherRemark && (
                <div className="border-t pt-2 mt-2 mb-2">
                  <div className="text-sm font-medium mb-1">
                    Current Weather:
                  </div>
                  <div className="flex items-center gap-2">
                    <img
                      src={
                        weatherRemarks
                          .find((r) => r.stationId === station.stationId)
                          ?.weatherRemark?.split(" - ")[0] ||
                        "/broadcasting.png" ||
                        "/placeholder.svg"
                      }
                      alt="Weather Symbol"
                      className="h-8 w-8 object-contain"
                      onError={(e) => {
                        e.currentTarget.src = "/broadcasting.png";
                      }}
                    />
                    <span className="text-sm text-gray-700">
                      {weatherDescription}
                    </span>
                  </div>
                </div>
              )}

              {selectedStation?.id === station.id && (
                <div className="border-t pt-2 mt-2">
                  {loading ? (
                    <div className="text-xs">Loading weather data...</div>
                  ) : error ? (
                    <div className="text-xs text-red-500">{error}</div>
                  ) : weatherData ? (
                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex items-center">
                        <Thermometer className="h-4 w-4 mr-2 text-orange-500" />
                        <div className="text-xs">
                          <span className="font-medium">Temperature: </span>
                          {weatherData.maxTemperature
                            ? `${weatherData.maxTemperature}°C (max)`
                            : "N/A"}{" "}
                          /
                          {weatherData.minTemperature
                            ? `${weatherData.minTemperature}°C (min)`
                            : "N/A"}
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Droplets className="h-4 w-4 mr-2 text-blue-500" />
                        <div className="text-xs">
                          <span className="font-medium">Precipitation: </span>
                          {weatherData.totalPrecipitation
                            ? `${weatherData.totalPrecipitation} mm`
                            : "No data"}
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Wind className="h-4 w-4 mr-2 text-gray-500" />
                        <div className="text-xs">
                          <span className="font-medium">Wind Speed: </span>
                          {weatherData.windSpeed
                            ? `${weatherData.windSpeed} NM`
                            : "No data"}
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Cloud className="h-4 w-4 mr-2 text-gray-400" />
                        <div className="text-xs">
                          <span className="font-medium">Cloud Cover: </span>
                          {weatherData.avTotalCloud
                            ? `${weatherData.avTotalCloud}%`
                            : "No data"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">
                      No weather data available for {currentDate}
                    </div>
                  )}
                </div>
              )}
            </Popup>
          </Marker>
        );
      })}

      {selectedStation && (
        <LiveLocationMarker
          station={{
            coordinates: [selectedStation.latitude, selectedStation.longitude],
          }}
        />
      )}
    </>
  );
}

export default function MapComponent({
  currentDate,
  setCurrentDate,
  isPlaying,
  setIsPlaying,
  selectedStation,
  onStationSelect,
}: MapComponentProps) {
  const generateDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(
        date.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
      );
    }
    return dates;
  };

  const dates = generateDates();
  const { data: session } = useSession();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  const [weatherData, setWeatherData] = useState<DailySummary | null>(null);
  const [weatherRemarks, setWeatherRemarks] = useState<WeatherRemark[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Weather layer states
  const [activeWeatherLayer, setActiveWeatherLayer] =
    useState<WeatherParameter | null>(null);
  const [layerLoading, setLayerLoading] = useState(false);

  return (
    <div className="relative h-full w-full z-10">
      {/* Map Container */}
      <div className="relative h-[500px] w-full rounded-lg overflow-hidden border-2 border-gray-200">
        <MapContainer
          center={[23.685, 90.3563]}
          zoom={7}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          minZoom={6}
          maxBounds={[
            [20.5, 88.0],
            [26.5, 92.5],
          ]}
        >
          <FixLeafletIcons />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <StationMarkers
            stations={stations}
            selectedStation={selectedStation}
            onStationSelect={onStationSelect}
            weatherData={weatherData}
            weatherRemarks={weatherRemarks}
            currentDate={currentDate}
            loading={loading}
          />

          <CustomZoomControl />
        </MapContainer>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-30 z-[1000]">
          <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg">
            Loading stations...
          </div>
        </div>
      )}

      {/* Weather Parameter Buttons */}
      <div className="absolute left-4 top-4 z-[1000] max-w-xs rounded-lg border border-border bg-card p-3 text-card-foreground shadow-lg md:left-14">
        <div className="grid grid-cols-8 gap-2">
          {weatherParameters.map((param) => {
            const Icon = param.icon;
            const isActive = activeWeatherLayer === param.key;

            return (
              <Button
                key={param.key}
                size="sm"
                variant={isActive ? "default" : "outline"}
                onClick={() => setActiveWeatherLayer(param.key)}
                className={`flex items-center gap-2 text-xs h-8`}
                disabled={layerLoading}
              >
                <div className="relative group">
                  <Icon className="h-3 w-3" />
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none whitespace-nowrap">
                    {param.label}
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
        {layerLoading && (
          <div className="mt-2 text-center text-xs text-muted-foreground">
            Loading animation data...
          </div>
        )}
      </div>

      {/* Timeline Controls */}
      <div className="absolute bottom-4 left-4 right-4 z-[1000] rounded-lg border border-border bg-card p-3 text-card-foreground shadow-lg">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant={isPlaying ? "default" : "outline"}
            onClick={() => setIsPlaying(!isPlaying)}
            className="h-9 w-9"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <div className="w-20 rounded bg-muted px-2 py-1 text-center text-sm font-medium">
            {currentDate}
          </div>
        </div>
      </div>

      {/* User role indicator */}
      <div className="absolute right-4 top-4 z-[1000] rounded-lg border border-border bg-card p-2 text-card-foreground shadow-lg">
        <div className="text-sm font-medium">
          {session?.user?.role === "super_admin" ||
          session?.user?.role === "root_admin"
            ? "Admin"
            : session?.user?.role === "station_admin"
              ? "Station Admin"
              : session?.user?.role === "observer"
                ? "Observer"
                : "Guest"}
        </div>
        <div className="text-xs text-muted-foreground">
          {session?.user?.role === "super_admin" ||
          session?.user?.role === "root_admin"
            ? "Viewing all stations"
            : session?.user?.role === "station_admin" ||
                session?.user?.role === "observer"
              ? "Viewing your assigned station"
              : "No stations available"}
        </div>
      </div>

      {/* Weather summary panel */}
      {selectedStation && (
        <div className="absolute bottom-20 right-4 z-[1000] w-64 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-lg">
          <div className="text-sm font-medium mb-2">Weather Summary</div>
          {loading ? (
            <div className="text-xs">Loading weather data...</div>
          ) : error ? (
            <div className="text-xs text-red-500">{error}</div>
          ) : weatherData ? (
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center">
                <Thermometer className="h-4 w-4 mr-2 text-orange-500" />
                <div className="text-xs">
                  <span className="font-medium">Temperature: </span>
                  {weatherData.maxTemperature
                    ? `${weatherData.maxTemperature}°C (max)`
                    : "N/A"}{" "}
                  /
                  {weatherData.minTemperature
                    ? `${weatherData.minTemperature}°C (min)`
                    : "N/A"}
                </div>
              </div>
              <div className="flex items-center">
                <Droplets className="h-4 w-4 mr-2 text-blue-500" />
                <div className="text-xs">
                  <span className="font-medium">Precipitation: </span>
                  {weatherData.totalPrecipitation
                    ? `${weatherData.totalPrecipitation} mm`
                    : "No data"}
                </div>
              </div>
              <div className="flex items-center">
                <Wind className="h-4 w-4 mr-2 text-gray-500" />
                <div className="text-xs">
                  <span className="font-medium">Wind Speed: </span>
                  {weatherData.windSpeed
                    ? `${weatherData.windSpeed} NM`
                    : "No data"}
                </div>
              </div>
              <div className="flex items-center">
                <Cloud className="h-4 w-4 mr-2 text-gray-400" />
                <div className="text-xs">
                  <span className="font-medium">Cloud Cover: </span>
                  {weatherData.avTotalCloud
                    ? `${weatherData.avTotalCloud}%`
                    : "No data"}
                </div>
              </div>
              {weatherData.totalPrecipitation &&
                Number.parseFloat(weatherData.totalPrecipitation) > 0 && (
                  <div className="text-xs text-blue-600 font-medium mt-1">
                    Rain detected: {weatherData.totalPrecipitation} mm
                  </div>
                )}
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              No weather data available
            </div>
          )}
        </div>
      )}

      {/* Custom CSS for weather icons */}
      <style jsx global>{`
        .weather-remark-icon {
          border-radius: 0;
          box-shadow: none;
          border: none;
        }
        .default-station-icon {
          border-radius: 0;
          box-shadow: none;
          border: none;
        }
      `}</style>
    </div>
  );
}
