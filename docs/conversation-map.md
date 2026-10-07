# Conversation Map

Conversation Map is a navigation view in the Assistant Workbench. Use it to browse project discussions, trace branch origins, search message history, and return to a conversation to continue chatting.

## Access and defaults

Select **Conversation Map** from the Assistant's Workbench menu to open a separate tab. It is a built-in, on-demand view: it is available without configuring Assistant middleware and does not open automatically on first use.

On first use, the view selects the current project and uses a vertical tree with compact nodes. Previous versions and shared history are hidden. The project selector includes projects you can access within the current Assistant's version family, plus **Unassigned** for conversations without a project. Expand conversations, branches, and messages as needed, and select **Load more** to continue browsing.

## Nodes and relationships

| Node         | Meaning                                                    | Main information                                                                                       |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Project      | The project scope of the conversations                     | Project name and last update time                                                                      |
| Conversation | An independent conversation                                | Title, latest user question on the current branch, and last update time                                |
| Branch       | A discussion path within a conversation                    | Branch name, parent conversation, latest user question, last update time, and current-branch indicator |
| Message      | A user question and its subsequent visible assistant reply | Question summary, parent conversation, and last update time; select it to preview the exchange         |

Messages belong to conversations. Branches can inherit history along their ancestor paths; inherited questions are labeled **inherited**. Enable **Show shared history** to reveal this content, or **Show previous versions** to include older discussion versions created by message edits.

An independent fork creates a new conversation. The Relations layout shows its origin with a dashed line. This connection records the source; it does not make the new conversation a child owned by the source conversation.

You can rename conversations and branches. Message titles use excerpts from user questions without calling a model to generate titles. The view displays a placeholder when no user question or text is available, and does not invent missing update times.

## Browsing layouts

| Layout    | Best for                                            | Relationship display                                                      |
| --------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Tree      | Browsing project discussions by hierarchy           | Project → conversation → branch → question and reply                      |
| Relations | Tracing how discussions branch and continue         | Branch ancestry and dashed source links between independent conversations |
| List      | Scanning titles, latest questions, and update times | Directory-style indentation, expansion arrows, and guide lines            |

Graphical layouts support vertical and horizontal orientation, zoom, fit view, and a minimap. The expand/collapse button sits at the center of each card's bottom border. Connections display existing relationships; dragging a connection cannot change the underlying relationship.

Use **Display** to select the Compact or Summary node style and control shared-history visibility. Compact nodes emphasize titles and short excerpts. Summary nodes show more question content and conversation context. Cards size themselves to their content; tooltips show full titles and timestamps.

List rows place the title, type icon, update time, and quick actions on the first line, with a question or reply excerpt on the second. Type icons have explanatory tooltips. Expansion arrows work independently of title selection. When a title has keyboard focus, use the left and right arrow keys to collapse or expand it.

## Search and message navigation

Search covers accessible conversations in the selected project and the current Assistant's version family. It matches text fragments in conversation titles and user-visible questions and replies. Results highlight matching text and include a location path through the project, conversation, branch, and message.

A message shared by several branches of the same conversation appears as a single result. Choose which branch to open from that result. **Show previous versions** controls whether historical versions participate in search. Select **Search more conversations** to retrieve further results.

In the message preview, **Locate in chat** opens the corresponding conversation and exact branch, loads older history when needed, then scrolls to and highlights the target message. If the message cannot be located, the host reports the failure.

## Conversation actions

| Action               | Available from                                                  | Result                                                                                                                               |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| New conversation     | Top toolbar                                                     | Creates and opens an independent conversation in the selected project scope                                                          |
| Locate in chat       | Card or list quick actions, or message preview                  | Opens the conversation and branch; scrolls to and highlights a message when one is specified                                         |
| Start side chat      | Branch quick actions or action menu                             | Creates a new branch within the same conversation, starting at the selected branch's tip                                             |
| Branch into new chat | Actions on an exchange whose assistant reply supports branching | Creates an independent conversation from the reply's saved state and copies history through that reply; project files remain shared  |
| Rename               | Conversation or branch action menu                              | Updates the conversation title or branch name                                                                                        |
| Copy link            | Action menu                                                     | Copies a link containing the conversation, branch, and optional message location, preserving the current view and display parameters |

Cards and list rows provide persistent action icons with tooltips on hover or keyboard focus. A running or paused branch cannot start a side chat. An incomplete reply, unsupported state format, or unavailable saved state prevents an independent fork; the view explains why. Pending requests block duplicate actions, and creation and branching retries reuse the original request identifier.

The host handles actual chat interactions. Opening, locating, or creating a conversation preserves the Conversation Map tab, query, and layout. Browsing and navigation do not send messages or stop running branches.

## Permissions, state, and limitations

- Projects, conversations, counts, search, and actions use the platform's organization and resource authorization. Read, contribute, and manage operations apply their respective permission checks; renaming requires manage access.
- Sharing a link does not grant access. Opening a link still validates access to the conversation, branch, and target message.
- Navigation shows only user-visible messages. It excludes internal runtime inputs, tool inputs, reasoning content, and checkpoint data.
- The host saves project selection, search, and display preferences so they can be restored after a refresh. Host context changes refresh authorized data and cancel stale requests. Closing the view cleans up pending requests.
- The interface follows the host's language and light or dark theme. Narrow panels collapse secondary controls. Buttons, menus, search results, and message previews support keyboard interaction.
- Search scans visible history in pages; conversations with extensive history may take longer to search. Message navigation requires a host ChatKit version that supports locating messages. Unsupported hosts display an explicit notice.
