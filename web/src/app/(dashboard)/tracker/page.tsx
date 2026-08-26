"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Download, Briefcase, GripVertical, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Application {
  id: string;
  company: string;
  role: string;
  status: string;
  notes: string;
  applied_at: string;
  tailored_output_id?: string;
}

const STATUSES = ["Applied", "Interviewing", "Offer", "Rejected"];

/** Escape a CSV cell value: wrap in quotes if it contains commas, quotes, or newlines */
function csvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export default function TrackerPage() {
  const { user } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  // New app state
  const [isAdding, setIsAdding] = useState(false);
  const [newCompany, setNewCompany] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newStatus, setNewStatus] = useState("Applied");

  // Details dialog state
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [editCompany, setEditCompany] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const fetchApps = async () => {
    try {
      const res = await api.getApplications();
      setApps(res.data);
    } catch (error) {
      console.error("Failed to fetch applications:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchApps();
  }, [user]);

  const handleSaveApp = async () => {
    if (!newCompany.trim() || !newRole.trim()) return;
    try {
      await api.saveApplication(newCompany, newRole, newStatus);
      setNewCompany("");
      setNewRole("");
      setNewStatus("Applied");
      setIsAdding(false);
      toast.success(`Added ${newCompany} — ${newRole}`);
      await fetchApps();
    } catch (error) {
      console.error("Failed to save application:", error);
      toast.error("Failed to save application.");
    }
  };

  const updateStatus = async (appId: string, status: string) => {
    // Optimistic update
    setApps(apps.map(a => a.id === appId ? { ...a, status } : a));
    try {
      await api.updateApplicationStatus(appId, status);
      toast.success(`Status updated to ${status}`);
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to update status.");
      fetchApps(); // Revert on failure
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;

    const newStatus = destination.droppableId;
    updateStatus(draggableId, newStatus);
  };

  const openDetails = (app: Application) => {
    setSelectedApp(app);
    setEditCompany(app.company);
    setEditRole(app.role);
    setEditStatus(app.status);
    setEditNotes(app.notes || "");
  };

  const saveDetails = async () => {
    if (!selectedApp) return;
    try {
      await api.updateApplication(selectedApp.id, {
        company: editCompany,
        role: editRole,
        status: editStatus,
        notes: editNotes,
      });
      toast.success("Application updated.");
      setSelectedApp(null);
      fetchApps();
    } catch (error) {
      console.error("Failed to update application:", error);
      toast.error("Failed to update application.");
    }
  };

  const handleDelete = async () => {
    if (!selectedApp) return;
    try {
      await api.deleteApplication(selectedApp.id);
      toast.success(`Deleted ${selectedApp.company} — ${selectedApp.role}`);
      setSelectedApp(null);
      fetchApps();
    } catch (error) {
      console.error("Failed to delete application:", error);
      toast.error("Failed to delete application.");
    }
  };

  const exportCSV = () => {
    const headers = ["Company", "Role", "Status", "Date Applied", "Notes"];
    const rows = apps.map(a => [
      csvCell(a.company),
      csvCell(a.role),
      csvCell(a.status),
      csvCell(new Date(a.applied_at).toLocaleDateString()),
      csvCell(a.notes || "")
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "jobfit_applications.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success(`Exported ${apps.length} applications to CSV.`);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  const responseRate = apps.length > 0 
    ? ((apps.filter(a => a.status === "Interviewing" || a.status === "Offer").length / apps.length) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Application Tracker</h1>
          <p className="text-muted-foreground mt-2">
            Track your job applications and monitor your progress.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          {!isAdding && (
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="mr-2 h-4 w-4" /> Log Application
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Applications</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground/50" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{apps.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Response Rate</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground/50" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{responseRate}%</div>
          </CardContent>
        </Card>
      </div>

      {isAdding && (
        <Card className="border-blue-200 dark:border-blue-800 shadow-sm">
          <CardContent className="pt-6">
            <div className="grid grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <Label>Company</Label>
                <Input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="Software Engineer" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={newStatus} onValueChange={(val) => setNewStatus(val as string)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveApp} className="flex-1" disabled={!newCompany || !newRole}>Save</Button>
                <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="board" className="w-full">
        <TabsList>
          <TabsTrigger value="board">Kanban Board</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4">
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {STATUSES.map(status => (
                <Droppable key={status} droppableId={status}>
                  {(provided) => (
                    <div 
                      ref={provided.innerRef} 
                      {...provided.droppableProps}
                      className="bg-muted p-4 rounded-lg min-h-[500px] flex flex-col gap-3"
                    >
                      <h3 className="font-semibold text-foreground mb-2">
                        {status} ({apps.filter(a => a.status === status).length})
                      </h3>
                      {apps.filter(a => a.status === status).map((app, index) => (
                        <Draggable key={app.id} draggableId={app.id} index={index}>
                          {(provided, snapshot) => (
                            <Card 
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`cursor-pointer shadow-sm hover:shadow-md transition-shadow ${snapshot.isDragging ? "opacity-75 ring-2 ring-primary" : ""}`}
                              onClick={() => openDetails(app)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={`https://logo.clearbit.com/${app.company.replace(/\s+/g, '')}.com`} />
                                      <AvatarFallback className="text-[10px]">{app.company.substring(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="font-medium truncate max-w-[120px]">{app.company}</div>
                                  </div>
                                  <GripVertical className="h-4 w-4 text-muted-foreground/30" />
                                </div>
                                <div className="text-xs text-muted-foreground mb-2 truncate">{app.role}</div>
                                <div className="text-[10px] text-muted-foreground/70">
                                  {new Date(app.applied_at).toLocaleDateString()}
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </DragDropContext>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <Card>
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Company</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Role</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date Applied</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {apps.map(app => (
                    <tr key={app.id} className="border-b transition-colors hover:bg-muted/50 cursor-pointer" onClick={() => openDetails(app)}>
                      <td className="p-4 align-middle font-medium flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={`https://logo.clearbit.com/${app.company.replace(/\s+/g, '')}.com`} />
                          <AvatarFallback className="text-[10px]">{app.company.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {app.company}
                      </td>
                      <td className="p-4 align-middle">{app.role}</td>
                      <td className="p-4 align-middle text-muted-foreground">{new Date(app.applied_at).toLocaleDateString()}</td>
                      <td className="p-4 align-middle">
                        <Select value={app.status} onValueChange={(val) => updateStatus(app.id, val as string)}>
                          <SelectTrigger className="h-8 text-xs w-[130px]" onClick={(e) => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                  {apps.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted-foreground">No applications tracked yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Details / Edit Dialog */}
      <Dialog open={!!selectedApp} onOpenChange={(open) => !open && setSelectedApp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company</Label>
                <Input value={editCompany} onChange={(e) => setEditCompany(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input value={editRole} onChange={(e) => setEditRole(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={(val) => setEditStatus(val as string)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date Applied</Label>
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-transparent px-3 py-2 text-sm text-muted-foreground">
                  {selectedApp && new Date(selectedApp.applied_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea 
                value={editNotes} 
                onChange={(e) => setEditNotes(e.target.value)} 
                placeholder="Interview details, contact emails, etc."
                className="h-24"
              />
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between items-center w-full">
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelectedApp(null)}>Cancel</Button>
              <Button onClick={saveDetails}>Save Changes</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
