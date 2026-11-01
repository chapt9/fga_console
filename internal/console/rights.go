package console

// Right is a named set of fga capabilities: the most someone holding it
// may ever do, whatever the rules say. fga itself knows only capabilities
// (fga-admin grant -type -actions); rights and profiles are the console's
// way of giving them in plain words.
type Right struct {
	ID           string              `json:"id"`
	Name         string              `json:"name"`
	Help         string              `json:"help"`
	Capabilities map[string][]string `json:"capabilities"`
}

// Profile is a ready-made set of rights to start from.
type Profile struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Help   string   `json:"help"`
	Rights []string `json:"rights"`
}

var approvable = []string{"storage.bucket", "storage.object", "document.version", "document.text_unit", "document.derived", "text.entry"}

func approveCaps() map[string][]string {
	m := map[string][]string{"agent.tool": {"approve", "resolve", "write-off"}}
	for _, t := range approvable {
		m[t] = []string{"approve"}
	}
	return m
}

// consoleRight lets a person use the console's own pages: fga answers
// them their own record (principal.self read, GET /v1/me).
const consoleRight = "console"

// Rights are the console's rights, in fga's registered types and actions.
var Rights = []Right{
	{consoleRight, "Use the web console", "Sign in here and see the pages their other rights allow", map[string][]string{
		"principal.self": {"read"}}},
	{"open", "Open files", "Find, see and open what the rules allow them, and keep their own keys", map[string][]string{
		"storage.bucket": {"list"}, "storage.object": {"read", "stat", "discover", "read-history", "discover-history"},
		"document.version": {"read-units", "discover"}, "document.text_unit": {"read"}, "document.derived": {"deliver"}, "text.entry": {"read"},
		"crypto.envelope": {"release"}, "crypto.recipient": {"enroll", "activate", "receive-key", "revoke", "discover"}, "crypto.signing-key": {"discover"}}},
	{"upload", "Upload and replace", "Add files and new versions of them", map[string][]string{
		"storage.bucket": {"create-object"}, "storage.object": {"new-version"}, "document.derived": {"new-version"}, "text.entry": {"update"}}},
	{"delete", "Delete", "Delete files and their old versions", map[string][]string{"storage.object": {"delete", "delete-version"}}},
	{"share", "Share with others", "Give other people access to single files", map[string][]string{
		"storage.bucket": {"share"}, "storage.object": {"share"}, "document.version": {"share"}, "document.text_unit": {"share"},
		"document.derived": {"share"}, "text.entry": {"share"}, "crypto.envelope": {"create", "retire"}}},
	{"sensitivity", "Change sensitivity", "Mark things more or less sensitive; less needs an approval", map[string][]string{
		"storage.object": {"label", "relabel", "propose-label"}, "document.text_unit": {"label", "relabel", "propose-label"},
		"document.derived": {"label", "relabel", "declassify"}}},
	{"export", "Take copies out", "Export files and download originals", map[string][]string{
		"storage.object": {"export"}, "document.version": {"raw-read", "export"}, "document.text_unit": {"export-key"}}},
	{"approve", "Approve requests", "Decide on requests that need a second person", approveCaps()},
	{"ai", "Use AI and tools", "Run tools, and let AI assistants work with their files", map[string][]string{
		"agent.tool": {"discover", "invoke"}, "text.entry": {"use-in-model"}}},
	{"send", "Send data outside", "Send data to approved external addresses", map[string][]string{"network.destination": {"send"}}},
	{"manage-spaces", "Manage spaces", "Change the settings of spaces", map[string][]string{"storage.bucket": {"manage"}}},
	{"signing", "Sign files", "Register and use their own signing keys", map[string][]string{"crypto.signing-key": {"enroll", "activate", "retire"}}},
}

var memberRights = []string{consoleRight, "open", "upload", "delete", "share", "sensitivity", "ai", "signing"}

// DefaultProfiles are the profiles a new console starts with. Every one
// but "No rights" uses the console; an AI agent works through fga's APIs.
var DefaultProfiles = []Profile{
	{"none", "No rights", "Can do nothing, not even use this console", []string{}},
	{"reader", "Reader", "Finds and opens what the rules allow", []string{consoleRight, "open"}},
	{"member", "Member", "Works with files: opens, uploads, deletes and shares", memberRights},
	{"member-no-share", "Member who cannot share", "Like a member, but never gives others access",
		[]string{consoleRight, "open", "upload", "delete", "sensitivity", "ai", "signing"}},
	{"lead", "Team lead", "A member who also approves requests and manages spaces",
		append(append([]string{}, memberRights...), "approve", "export", "manage-spaces")},
	{"steward", "File steward", "Gives people access to single files, and opens nothing", []string{consoleRight, "open", "share"}},
	{"agent", "AI agent", "Opens files and runs tools for the people it acts for", []string{"open", "ai"}},
}
