import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
import os, textwrap, pathlib, math

out_dir = "wireframes"
os.makedirs(out_dir, exist_ok=True)
def make_screen(title, blocks, filename):
    fig, ax = plt.subplots(figsize=(7,12))
    ax.set_xlim(0,1); ax.set_ylim(0,1)
    ax.axis("off")

    # outer screen
    ax.add_patch(Rectangle((0.05,0.05),0.9,0.9, fill=False, linewidth=2))
    ax.text(0.5,0.94,"\n"+title, ha="center", va="center", fontsize=14, weight="bold")

    for b in blocks:
        x,y = b["xy"]; w,h = b["wh"]
        ax.add_patch(Rectangle((x,y),w,h, fill=False, linewidth=1.5))

        if b.get("label"):
            ax.text(x+w/2, y+h/2, b["label"], ha="center", va="center", fontsize=12)

        if b.get("lines"):
            ty = y+h-0.03
            for line in b["lines"]:
                ax.text(
                    x+0.02, ty, line,
                    ha="left", va="top",
                    fontsize=10,
                    fontfamily="monospace"   # ✅ key fix
                )
                ty -= 0.04

    path = os.path.join(out_dir, filename)
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return path


paths = []

# UI-2 Map View
paths.append(make_screen(
    "EV CMA - Map View",
    [
        {"xy":(0.1,0.85),"wh":(0.8,0.06),"label":"","lines":["[Search chargers...]"]},
        {"xy":(0.1,0.79),"wh":(0.8,0.06),"label":"","lines":["Filters: Connector | Power | Price | Available"]},
        {"xy":(0.1,0.25),"wh":(0.8,0.52),"label":"MAP",
         "lines":["• Charger-01      • Charger-02      • Charger-03"]},
        {"xy":(0.1,0.14),"wh":(0.8,0.08),"label":"","lines":["[Center] [List] [Charger Status] [Profile] [Help]"]},
    ],
    "ui2_map_view.png"
))

# UI-3 Charger Details
paths.append(make_screen(
    "Charger Details",
    [
        {"xy":(0.1,0.72),"wh":(0.8,0.18),"label":"",
         "lines":["Station NTUA-01","Address: Zografou Campus","Distance: 1.2 km","Status: AVAILABLE"]},
        {"xy":(0.1,0.5),"wh":(0.8,0.18),"label":"",
         "lines":["Connectors: Type2, CCS","Max Power: 22 kW","Tariff now: 0.42 €/kWh"]},
        {"xy":(0.1,0.36),"wh":(0.8,0.1),"label":"",
         "lines":["[Reserve Charger]     [Navigate to Charger]"]},
        {"xy":(0.7,0.1),"wh":(0.2,0.05),"label":"",
         "lines":["[Back]",""]},
    ],
    "ui3_charger_details.png"
))

# UI-4 Reservation Setup
paths.append(make_screen(
    "Reserve Charger",
    [
        {"xy":(0.1,0.7),"wh":(0.8,0.2),"label":"",
         "lines":["Select duration (max 30')","( ) 10 min   ( ) 20 min   (X) 30 min"]},
        {"xy":(0.1,0.52),"wh":(0.8,0.12),"label":"",
         "lines":["Estimated pre-authorization: 15.00 €"]},
        {"xy":(0.1,0.36),"wh":(0.8,0.12),"label":"",
         "lines":["[Confirm Reservation]     [Cancel]"]},
    ],
    "ui4_reservation_setup.png"
))

# UI-5 Reservation Countdown
paths.append(make_screen(
    "Reservation Active",
    [
        {"xy":(0.1,0.74),"wh":(0.8,0.16),"label":"",
         "lines":["Charger: Charger-01","Time left: 00:18:45"]},
        {"xy":(0.1,0.5),"wh":(0.8,0.18),"label":"COUNTDOWN / TIMER BAR"},
        {"xy":(0.1,0.32),"wh":(0.8,0.12),"label":"",
         "lines":["[I arrived / Check-in] [Navigate to charger]","[Cancel Reservation]"]},
        {"xy":(0.7,0.1),"wh":(0.23,0.05),"label":"",
         "lines":["[Back to Map]"]},
    ],
    "ui5_countdown.png"
))

# UI-7 Active Charging
paths.append(make_screen(
    "Charging Session",
    [
        {"xy":(0.1,0.70),"wh":(0.8,0.2),"label":"",
         "lines":["Energy delivered: 6.4 kWh","Time elapsed: 00:18:32","Estimated cost: 2.69 €","Remaining preauth: 12.31 €"]},
        {"xy":(0.1,0.48),"wh":(0.8,0.18),"label":"LIVE PROGRESS / CHART"},
        {"xy":(0.1,0.32),"wh":(0.8,0.12),"label":"",
         "lines":["[Navigate to charger]     [Report Issue]","[Back to Map]"]},
    ],
    "ui7_active_charging.png"
))

# UI-8 Session Summary
paths.append(make_screen(
    "Session Summary",
    [
        {"xy":(0.1,0.68),"wh":(0.8,0.22),"label":"",
         "lines":["Final energy: 12.8 kWh","Total time: 00:41:10","Final cost: 5.22 €","Payment: Captured"]},
        {"xy":(0.1,0.5),"wh":(0.8,0.12),"label":"",
         "lines":["[Download Receipt]     [Share]"]},
        {"xy":(0.1,0.34),"wh":(0.8,0.12),"label":"",
         "lines":["[Go to Profile Stats]     [Navigate to charger]","[[Report Issue]     [Back to Map]"]},
    ],
    "ui8_summary.png"
))

# UI-9 Profile & Stats
paths.append(make_screen(
    "Profile & Statistics",
    [
        {"xy":(0.1,0.7),"wh":(0.8,0.2),"label":"",
         "lines":[
             "Petros P.                               [Edit]",
             "Email: petros@mail.com                  [Edit]",
             #"Default vehicle: Tesla Model 3",
             "Payment: Visa **** 1234                 [Edit]"
         ]},

        # ✅ stats strip with monospace-aligned two-row layout
        {"xy":(0.1,0.55),"wh":(0.8,0.1),"label":"",
         "lines":[
             "Sessions            Energy               Cost",
             "14                 168 kWh              72.4 €"
         ]},

        {"xy":(0.1,0.33),"wh":(0.8,0.18),"label":"TREND CHARTS"},

        {"xy":(0.1,0.2),"wh":(0.8,0.1),"label":"",
         "lines":["[Detailed History]     [Back to Map]"]},
    ],
    "ui9_profile_stats.png"
))

# UI-10 Detailed History
paths.append(make_screen(
    "Detailed History",
    [
        # Filters / header
        {"xy": (0.1, 0.78), "wh": (0.8, 0.12), "label": "",
         "lines": [
             "Date range: [ Last month v ]",
             "Charger: [ All chargers v ] [ Apply ] [ Reset ]"
         ]},

        # Table area
        {"xy": (0.1, 0.40), "wh": (0.8, 0.34), "label": "",
         "lines": [
             "Date    Station    Charger      Energy    Cost",
             "date1   station1   Charger-01   12.3 kWh  5.10 €",
             "date2   station1   Charger-02    8.7 kWh  3.65 €",
             "date3   station1   Charger-01   15.0 kWh  6.20 €",
             " ...     ...         ...         ...      ..."
         ]},


        {"xy": (0.1, 0.26), "wh": (0.8, 0.08), "label": "",
         "lines": [
             "[Back to Profile]     [Back to Map]"
         ]},
    ],
    "ui10_detailed_history.png"
))


paths


