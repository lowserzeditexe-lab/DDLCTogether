# DDLC Together — Main menu integration (label side).
# game/multiplayer/menu.rpy
#
# The "Multijoueur" textbutton itself lives in screens.rpy's `navigation`
# screen (patched at build time — see /app/build.sh).  This file only
# defines the labels and the lightweight in-game waiting screen the
# button jumps to.

label MultiplayerEntry:
    $ mp_open_overlay(None, route="rooms")
    call screen mp_lobby_waiting

label MultiplayerStartGame:
    $ mp_open_overlay(_mp_room or "", route="overlay")
    jump start

# Lightweight in-game info screen shown while the external Edge --app=
# overlay is open.  Closing it returns the player to the main menu.
screen mp_lobby_waiting():
    tag menu
    modal True
    add "#000000cc"
    frame:
        xalign 0.5
        yalign 0.5
        background "#3D1C35"
        padding (32, 24)
        vbox:
            spacing 16
            text _("Panneau Multijoueur ouvert") size 32 color "#FF6B9D"
            text _("Le lobby s'est ouvert dans une fenêtre séparée.") size 22 color "#FFF0F5"
            text _("Reviens ici quand l'hôte lance la partie.") size 18 color "#FFC4D8"
            null height 12
            textbutton _("Fermer et retourner au menu"):
                style "navigation_button"
                text_style "navigation_button_text"
                action [Hide("mp_lobby_waiting"), MainMenu(confirm=False)]
